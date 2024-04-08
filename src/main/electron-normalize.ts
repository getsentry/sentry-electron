import { parseSemver } from '@sentry/utils';
import { app } from 'electron';
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
 * Uses Crashpad on Linux
 * https://github.com/electron/electron/issues/27859
 */
function crashpadLinux(): boolean {
  if (version.major >= 16) {
    return true;
  }

  // Crashpad Linux for v15 is behind a switch
  return app.commandLine.hasSwitch('enable-crashpad');
}

/** Is using Crashpad */
export function usesCrashpad(): boolean {
  return process.platform !== 'linux' || crashpadLinux();
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
