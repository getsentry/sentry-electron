import { parseSemver } from '@sentry/core';
import { app, Session } from 'electron';
import { join } from 'path';

import { RENDERER_ID_HEADER } from '../common/ipc';

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
 * Registers a custom protocol to receive events from the renderer
 *
 * Uses `protocol.handle` if available, otherwise falls back to `protocol.registerStringProtocol`
 */
export function registerProtocol(
  protocol: Electron.Protocol,
  scheme: string,
  callback: (request: InternalRequest) => void,
): void {
  if (supportsProtocolHandle()) {
    protocol.handle(scheme, async (request) => {
      callback({
        windowId: request.headers.get(RENDERER_ID_HEADER) || undefined,
        url: request.url,
        body: Buffer.from(await request.arrayBuffer()),
      });

      return new Response('');
    });
  } else {
    // eslint-disable-next-line deprecation/deprecation
    protocol.registerStringProtocol(scheme, (request, complete) => {
      callback({
        windowId: request.headers[RENDERER_ID_HEADER],
        url: request.url,
        body: request.uploadData?.[0]?.bytes,
      });

      complete('');
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
