export const PROTOCOL_SCHEME = 'sentry-ipc';

export enum IPCChannel {
  /** IPC to check main process is listening */
  RENDERER_START = 'sentry-electron.renderer-start',
  /** IPC to send a captured event to Sentry. */
  EVENT = 'sentry-electron.event',
  /** IPC to pass scope changes to main process. */
  SCOPE = 'sentry-electron.scope',
  /** IPC to pass envelopes to the main process. */
  ENVELOPE = 'sentry-electron.envelope',
  /** IPC to pass renderer status updates */
  STATUS = 'sentry-electron.status',
}

export type RendererStatus = 'alive' | 'visible' | 'hidden';

export interface IPCInterface {
  sendRendererStart: () => void;
  sendScope: (scope: string) => void;
  sendEvent: (event: string) => void;
  sendEnvelope: (evn: Uint8Array | string) => void;
  sendStatus: (state: RendererStatus) => void;
}

export const RENDERER_ID_HEADER = 'sentry-electron-renderer-id';

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    __SENTRY_IPC__?: IPCInterface;
    __SENTRY__RENDERER_INIT__?: boolean;
    __SENTRY_RENDERER_ID__?: string;
  }
}
