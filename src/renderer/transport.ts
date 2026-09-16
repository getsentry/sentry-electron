import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport, debug } from '@sentry/core';
import type { IPCInterface } from '../common/ipc.js';
import { envelopeDeliveryStatus } from '../common/ipc.js';
import { getIPC } from './ipc.js';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 *
 * The status is main's ingest result, not an acknowledgement that the bytes
 * were queued locally. `sendFeedback` resolves only when this is 2xx.
 *
 * - Protocol fetch failures reject the handoff. This transport then returns
 *   status 0. It does not return 200.
 * - A 2xx means the main transport received a 2xx from Sentry ingest.
 * - A missing status (offline queue write, `enabled: false`, dropped before send)
 *   is status 0. An envelope left on disk for a later retry is not delivery, so
 *   `sendFeedback` must not treat it as "Sentry received this".
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
