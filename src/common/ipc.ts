export const PROTOCOL_SCHEME = 'sentry-ipc';

export enum IPCChannel {
  /** IPC to check main process is listening */
  PING = 'sentry-electron.ping',
  /** IPC to send a captured event to Sentry. */
  EVENT = 'sentry-electron.event',
  /** IPC to capture scope globally. */
  SCOPE = 'sentry-electron.scope',
}

export interface IPCInterface {
  sendScope: (scope: string) => void;
  sendEvent: (event: string) => void;
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
