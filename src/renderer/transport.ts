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
    return { statusCode: 200 };
  });
}
