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

export interface RendererProcessAnrOptions {
  /**
   * Interval to send heartbeat messages to the child process.
   *
   * Defaults to 1000ms.
   */
  pollInterval: number;
  /**
   * The number of milliseconds to wait before considering the renderer process to be unresponsive.
   *
   * Defaults to 5000ms.
   */
  anrThreshold: number;
  /**
   * Whether to capture a stack trace when the renderer process is unresponsive.
   *
   * Defaults to `false`.
   */
  captureStackTrace: boolean;
}

export interface RendererStatus {
  status: 'alive' | 'visible' | 'hidden';
  config: RendererProcessAnrOptions;
}

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
