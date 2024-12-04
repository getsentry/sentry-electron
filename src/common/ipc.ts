import { MeasurementUnit, Primitive } from '@sentry/core';

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
  /** IPC to pass renderer metric additions to the main process */
  ADD_METRIC = 'sentry-electron.add-metric',
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

export interface MetricIPCMessage {
  metricType: 'c' | 'g' | 's' | 'd';
  name: string;
  value: number | string;
  unit?: MeasurementUnit;
  tags?: Record<string, Primitive>;
  timestamp?: number;
}

export interface IPCInterface {
  sendRendererStart: () => void;
  sendScope: (scope: string) => void;
  sendEvent: (event: string) => void;
  sendEnvelope: (evn: Uint8Array | string) => void;
  sendStatus: (state: RendererStatus) => void;
  sendAddMetric: (metric: MetricIPCMessage) => void;
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
    __SENTRY_IPC__?: IPCInterface;
    __SENTRY__RENDERER_INIT__?: boolean;
    __SENTRY_RENDERER_ID__?: string;
  }
}
