import type { SerializedLog, SerializedMetric, TransportMakeRequestResponse } from '@sentry/core';

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
  | 'structured-log'
  /** IPC to pass metric data */
  | 'metric';

export interface IpcUtils {
  createUrl: (channel: Channel) => string;
  urlMatches: (url: string, channel: Channel) => boolean;
  createKey: (channel: Channel) => string;
  readonly namespace: string;
}

/**
 * Utility for creating namespaced IPC channels and protocol routes
 */
export function ipcChannelUtils(namespace: string): IpcUtils {
  return {
    createUrl: (channel: Channel) => {
      // sentry_key in the url stops these messages from being picked up by our HTTP instrumentations
      return `${namespace}://${channel}/sentry_key`;
    },
    urlMatches: function (url: string, channel: Channel): boolean {
      return url.startsWith(this.createUrl(channel));
    },
    createKey: (channel: Channel) => {
      return `${namespace}.${channel}`;
    },
    namespace,
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
  /**
   * Hand an envelope to the main process and resolve with the ingest status.
   *
   * Rejects if the handoff itself fails (protocol fetch error, aborted upload).
   * A resolved 2xx means Sentry ingest responded 2xx — not that the bytes were
   * merely queued. See {@link envelopeDeliveryStatus}.
   */
  sendEnvelope: (evn: Uint8Array | string) => Promise<TransportMakeRequestResponse>;
  sendStatus: (state: RendererStatus) => void;
  sendStructuredLog: (log: SerializedLog) => void;
  sendMetric: (metric: SerializedMetric) => void;
}

/**
 * Status reported when an envelope was not accepted by Sentry ingest.
 *
 * `sendFeedback` resolves only for 2xx. 0 is not a 2xx, so a queued, dropped,
 * or disabled send is not shown as delivered.
 */
export const NOT_DELIVERED: TransportMakeRequestResponse = { statusCode: 0 };

/**
 * Status the renderer may report after main has finished with an envelope.
 *
 * A 2xx means the main transport received a 2xx from Sentry ingest. Anything else
 * is not delivery:
 *
 * - Network failures are written to the offline queue and `makeOfflineTransport`
 *   resolves with `{}` (no `statusCode`), not 200 (sentry-electron#942). Queuing
 *   is not "Sentry received this". `sendFeedback` rejects so the UI cannot treat
 *   a later retry as an already-successful submit. The envelope may still be sent
 *   from disk afterwards.
 * - 413 and other 4xx/5xx are passed through so `sendFeedback` rejects.
 * - `enabled: false` makes `Client.sendEnvelope` resolve with `{}`, which becomes 0.
 *
 * Rate-limit headers are not copied. The main process owns rate limiting; echoing
 * them would make the renderer drop later envelopes as well.
 */
export function envelopeDeliveryStatus(
  response: TransportMakeRequestResponse | void | null | undefined,
): TransportMakeRequestResponse {
  const statusCode = response?.statusCode;
  if (typeof statusCode !== 'number') {
    return NOT_DELIVERED;
  }

  return { statusCode };
}

/**
 * Reads the status main put in a protocol response.
 *
 * JSON `statusCode` is the contract. An empty body or a 2xx without a status
 * is not delivery — do not invent a 200 because the custom protocol responded.
 * A non-2xx HTTP status is used only when the body has no status of its own.
 */
export function decodeEnvelopeDeliveryStatus(body: string, httpStatus?: number): TransportMakeRequestResponse {
  const trimmed = body.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { statusCode?: unknown };
      if (typeof parsed.statusCode === 'number') {
        return envelopeDeliveryStatus({ statusCode: parsed.statusCode });
      }
    } catch {
      // Body was not the status JSON. Fall through to the HTTP status.
    }
  }

  if (typeof httpStatus === 'number' && (httpStatus < 200 || httpStatus >= 300)) {
    return { statusCode: httpStatus };
  }

  return NOT_DELIVERED;
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
    __SENTRY_IPC__?: Record<string, IPCInterface>;
    __SENTRY__RENDERER_INIT__?: boolean;
    __SENTRY_RENDERER_ID__?: string;
  }
}
