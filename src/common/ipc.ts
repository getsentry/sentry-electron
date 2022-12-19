export const PROTOCOL_SCHEME = 'sentry-ipc';

export enum IPCChannel {
  /** IPC to check main process is listening */
  PING = 'sentry-electron.ping',
  /** IPC to send a captured event to Sentry. */
  EVENT = 'sentry-electron.event',
  /** IPC to pass scope changes to main process. */
  SCOPE = 'sentry-electron.scope',
  /** IPC to pass envelopes to the main process. */
  ENVELOPE = 'sentry-electron.envelope',
}

export interface IPCInterface {
  sendScope: (scope: string) => void;
  sendEvent: (event: string) => void;
  sendEnvelope: (evn: Uint8Array | string) => void;
}

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__?: IPCInterface;
    __SENTRY__RENDERER_INIT__?: boolean;
  }
}
