import {
  BaseTransportOptions,
  createTransport,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { IPCInterface } from '../common/ipc.js';
import { getIPC } from './ipc.js';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 */
export function makeRendererTransport(options: BaseTransportOptions): Transport {
  let ipc: IPCInterface | undefined;

  return createTransport(options, async (request: TransportRequest): Promise<TransportMakeRequestResponse> => {
    // We delay getting the IPC interface until until there is a client where we can pull the IPC namespace from.
    if (!ipc) {
      ipc = getIPC();
    }

    ipc.sendEnvelope(request.body);
    // Since the main process handles sending of envelopes and rate limiting, we always return 200 OK to the renderers.
    return { statusCode: 200 };
  });
}
