import type { Session } from 'electron';
import { app } from 'electron';
import { join } from 'path';
import { RENDERER_ID_HEADER } from '../common/ipc.js';

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

interface InternalRequest {
  windowId?: string;
  url: string;
  body?: Buffer;
}

/**
 * Registers a custom protocol to receive events from the renderer
 */
export function registerProtocol(
  protocol: Electron.Protocol,
  scheme: string,
  callback: (request: InternalRequest) => void,
): void {
  protocol.handle(scheme, async (request) => {
    callback({
      windowId: request.headers.get(RENDERER_ID_HEADER) || undefined,
      url: request.url,
      body: Buffer.from(await request.arrayBuffer()),
    });

    return new Response('');
  });
}

/**
 * Adds a preload script to the session.
 */
export function setPreload(sesh: Session, path: string): void {
  sesh.registerPreloadScript({ type: 'frame', filePath: path });
}
