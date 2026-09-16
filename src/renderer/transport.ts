import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport, debug } from '@sentry/core';
import type { IPCInterface } from '../common/ipc.js';
import { envelopeDeliveryStatus } from '../common/ipc.js';
import { getIPC } from './ipc.js';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 *
 * Every envelope waits until main has the body. It does not return 200 if that
 * handoff fails.
 *
 * Only feedback then waits for ingest. `sendFeedback` resolves on a 2xx, which
 * means Sentry accepted it. A missing status (offline queue, `enabled: false`,
 * dropped before send) is status 0, so the promise rejects. A queued envelope
 * may still be sent from disk later; that is not delivery.
 *
 * Errors, spans, replays and profiles return once main has accepted them. They
 * do not wait for the network round-trip.
 *
 * Rate-limit headers are not forwarded. Main owns rate limiting.
 */
export function makeRendererTransport(options: BaseTransportOptions): Transport {
  let ipc: IPCInterface | undefined;

  return createTransport(options, async (request: TransportRequest): Promise<TransportMakeRequestResponse> => {
    // We delay getting the IPC interface until there is a client where we can pull the IPC namespace from.
    if (!ipc) {
      ipc = getIPC();
    }

    try {
      return envelopeDeliveryStatus(await ipc.sendEnvelope(request.body));
    } catch (error) {
      debug.error('Failed to hand renderer envelope to the Electron main process:', error);
      return envelopeDeliveryStatus();
    }
  });
}
