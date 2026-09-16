import type { TransportMakeRequestResponse } from '@sentry/core';
import { parseSemver } from '@sentry/core';
import type { Session } from 'electron';
import { app } from 'electron';
import { join } from 'path';
import { envelopeDeliveryStatus, RENDERER_ID_HEADER } from '../common/ipc.js';

const parsed = parseSemver(process.versions.electron);
const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };

export const ELECTRON_MAJOR_VERSION = version.major;

export const EXIT_REASONS = [
  'clean-exit',
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];
export const CRASH_REASONS: Readonly<ExitReason[]> = ['crashed', 'oom'] as const;

/** Gets the Sentry Cache path */
export function getSentryCachePath(): string {
  return join(app.getPath('userData'), 'sentry');
}

/**
 * Electron >= 25 support `protocol.handle`
 */
function supportsProtocolHandle(): boolean {
  return version.major >= 25;
}

interface InternalRequest {
  windowId?: string;
  url: string;
  body?: Buffer;
}

/**
 * HTTP status for a completed protocol request.
 *
 * 0 is not a valid HTTP status. The JSON body is the contract the renderer
 * reads; a non-2xx HTTP status is only a fallback if that body is missing.
 */
function protocolResponse(result: TransportMakeRequestResponse | void): { status: number; body: string } {
  if (!result) {
    return { status: 200, body: '' };
  }

  const status = envelopeDeliveryStatus(result);
  const statusCode = status.statusCode ?? 0;
  return {
    status: statusCode >= 200 && statusCode < 600 ? statusCode : 503,
    body: JSON.stringify(status),
  };
}

function protocolHttpResponse(result: TransportMakeRequestResponse | void): Response {
  const { status, body } = protocolResponse(result);
  return new Response(body, {
    status,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  });
}

/**
 * Registers a custom protocol to receive events from the renderer
 *
 * Uses `protocol.handle` if available, otherwise falls back to `protocol.registerStringProtocol`
 *
 * The response is sent only after `callback` settles, so a renderer `fetch` that
 * resolves has finished the handoff. Envelope callbacks return the ingest status;
 * other channels return nothing and get an empty 200.
 */
export function registerProtocol(
  protocol: Electron.Protocol,
  scheme: string,
  callback: (request: InternalRequest) => void | Promise<TransportMakeRequestResponse | void>,
): void {
  if (supportsProtocolHandle()) {
    protocol.handle(scheme, async (request) => {
      try {
        // Copy the body before doing more work. If the webContents is destroyed
        // after this, the callback still has the envelope.
        const body = Buffer.from(await request.arrayBuffer());
        const result = await callback({
          windowId: request.headers.get(RENDERER_ID_HEADER) || undefined,
          url: request.url,
          body,
        });

        return protocolHttpResponse(result);
      } catch {
        return protocolHttpResponse(envelopeDeliveryStatus());
      }
    });
  } else {
    // eslint-disable-next-line deprecation/deprecation
    protocol.registerStringProtocol(scheme, (request, complete) => {
      void Promise.resolve(
        callback({
          windowId: request.headers[RENDERER_ID_HEADER],
          url: request.url,
          body: request.uploadData?.[0]?.bytes,
        }),
      ).then(
        (result) => {
          const { status, body } = protocolResponse(result);
          complete({ data: body, statusCode: status, mimeType: 'application/json' });
        },
        () => {
          const failed = protocolResponse(envelopeDeliveryStatus());
          complete({ data: failed.body, statusCode: failed.status, mimeType: 'application/json' });
        },
      );
    });
  }
}

type PreloadScriptRegistration = {
  // Context type where the preload script will be executed.
  type: 'frame' | 'service-worker';
  // Unique ID of preload script. Defaults to a random UUID.
  id?: string;
  // Path of the script file. Must be an absolute path.
  filePath: string;
};

type SessionMaybeSupportingRegisterPreloadScript = Session & {
  registerPreloadScript?: (script: PreloadScriptRegistration) => void;
};

/**
 * Adds a preload script to the session.
 *
 * Electron >= v35 supports new `registerPreloadScript` method and `getPreloads` and `setPreloads` are deprecated.
 */
export function setPreload(sesh: SessionMaybeSupportingRegisterPreloadScript, path: string): void {
  if (sesh.registerPreloadScript) {
    sesh.registerPreloadScript({ type: 'frame', filePath: path });
  } else {
    const existing = sesh.getPreloads();
    sesh.setPreloads([path, ...existing]);
  }
}
