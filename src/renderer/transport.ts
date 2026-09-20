import type {
  BaseTransportOptions,
  Envelope,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { createTransport, envelopeContainsItemType } from '@sentry/core';
import type { IPCInterface } from '../common/ipc.js';
import { getIPC } from './ipc.js';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 *
 * Feedback envelopes wait for the main process to send them and return the
 * real result so that `sendFeedback` resolves or rejects correctly. All other
 * envelopes are handed to the main process and return 200 immediately.
 */
export function makeRendererTransport(options: BaseTransportOptions): Transport {
  let ipc: IPCInterface | undefined;
  // `send` calls the request function synchronously so this is always set
  // for the envelope it belongs to.
  let isFeedback = false;

  const transport = createTransport(
    options,
    async (request: TransportRequest): Promise<TransportMakeRequestResponse> => {
      // We delay getting the IPC interface until there is a client where we can pull the IPC namespace from.
      if (!ipc) {
        ipc = getIPC();
      }

      if (isFeedback) {
        return ipc.sendFeedback(request.body);
      }

      ipc.sendEnvelope(request.body);
      // Since the main process handles sending of envelopes and rate limiting, we always return 200 OK to the renderers.
      return { statusCode: 200 };
    },
  );

  return {
    send: (envelope: Envelope) => {
      isFeedback = envelopeContainsItemType(envelope, ['feedback']);
      return transport.send(envelope);
    },
    flush: (timeout?: number) => transport.flush(timeout),
  };
}
