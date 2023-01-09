import { createTransport } from '@sentry/core';
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

import { getIPC } from './ipc';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 */
export function makeRendererTransport(options: BaseTransportOptions): Transport {
  const ipc = getIPC();

  return createTransport(options, async (request: TransportRequest): Promise<TransportMakeRequestResponse> => {
    ipc.sendEnvelope(request.body);
    // Since the main process handles sending of envelopes and rate limiting, we always return 200 OK to the renderers.
    return { statusCode: 200 };
  });
}
