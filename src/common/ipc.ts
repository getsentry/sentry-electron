import { SerializedLog } from '@sentry/core';

/** Ways to communicate between the renderer and main process  */
export enum IPCMode {
  /** Configures Electron IPC to receive messages from renderers */
  Classic = 1,
  /** Configures Electron protocol module to receive messages from renderers */
  Protocol = 2,
  /**
   * Configures both methods for best compatibility.
   *
   * Renderers favour IPC but fall back to protocol if IPC has not
   * been configured in a preload script
   */
  Both = 3,
}

export const PROTOCOL_SCHEME = 'sentry-ipc';

export type Channel =
  /** IPC to check main process is listening */
  | 'start'
  /** IPC to pass scope changes to main process. */
  | 'scope'
  /** IPC to pass envelopes to the main process. */
  | 'envelope'
  /** IPC to pass renderer status updates */
  | 'status'
  /** IPC to pass structured log messages */
  | 'structured-log';

/**
 * Utilities for creating namespaced IPC channels and protocol routes
 */
export function ipcChannelUtils(namespace: string | undefined): {
  createUrl: (channel: Channel) => string;
  urlMatches: (url: string, channel: Channel) => boolean;
  createKey: (channel: Channel) => string;
  readonly globalKey: string;
} {
  const globalKey = `__${namespace?.replace('-', '_').toUpperCase() || 'SENTRY_IPC'}__`;

  return {
    createUrl: (channel: Channel) => {
      const scheme = namespace ? `${PROTOCOL_SCHEME}-${namespace}` : PROTOCOL_SCHEME;
      // sentry_key in the url stops these messages from being picked up by our HTTP instrumentations
      return `${scheme}://${channel}/sentry_key`;
    },
    urlMatches: function (url: string, channel: Channel): boolean {
      return url.startsWith(this.createUrl(channel));
    },
    createKey: (channel: Channel) => {
      return namespace ? `${PROTOCOL_SCHEME}-${namespace}.${channel}` : `${PROTOCOL_SCHEME}.${channel}`;
    },
    globalKey,
  };
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
  sendEnvelope: (evn: Uint8Array | string) => void;
  sendStatus: (state: RendererStatus) => void;
  sendStructuredLog: (log: SerializedLog) => void;
}

export const RENDERER_ID_HEADER = 'sentry-electron-renderer-id';

const UTILITY_PROCESS_MAGIC_MESSAGE_KEY = '__sentry_message_port_message__';

/** Does the message look like the magic message */
export function isMagicMessage(msg: unknown): boolean {
  return !!(msg && typeof msg === 'object' && UTILITY_PROCESS_MAGIC_MESSAGE_KEY in msg);
}

/** Get the magic message to send to the utility process */
export function getMagicMessage(): unknown {
  return { [UTILITY_PROCESS_MAGIC_MESSAGE_KEY]: true };
}

/**
 * We store the IPC interface on window so it's the same for both regular and isolated contexts
 */
declare global {
  interface Window {
    [key: string]: unknown;
    __SENTRY__RENDERER_INIT__?: boolean;
    __SENTRY_RENDERER_ID__?: string;
  }
}
