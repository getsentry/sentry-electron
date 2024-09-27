import { createTransport } from '@sentry/core';
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

import { getMagicMessage, isMagicMessage } from '../common/ipc';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 */
export function makeUtilityProcessTransport(): (options: BaseTransportOptions) => Transport {
  let mainMessagePort: Electron.MessagePortMain | undefined;

  async function sendEnvelope(envelope: string | Uint8Array): Promise<void> {
    if (mainMessagePort) {
      mainMessagePort.postMessage(envelope);
    }
  }

  // Receive the messageport from the main process
  process.parentPort.on('message', (msg) => {
    // eslint-disable-next-line no-console
    console.log('process.parentPort.on', JSON.stringify(msg));

    if (isMagicMessage(msg.data)) {
      const [port] = msg.ports;
      mainMessagePort = port;
    }
  });

  // We proxy `process.parentPort.on` so we can filter messages from the main SDK and ensure that users do not see them
  // eslint-disable-next-line @typescript-eslint/unbound-method
  process.parentPort.on = new Proxy(process.parentPort.on, {
    apply: (target, thisArg, [event, listener]) => {
      if (event === 'message') {
        return target.apply(thisArg, [
          'message',
          (msg: MessageEvent) => {
            if (isMagicMessage(msg.data)) {
              return;
            }

            return listener(msg);
          },
        ]);
      }

      return target.apply(thisArg, [event, listener]);
    },
  });

  // Notify the main process that this utility process has started with an SDK configured
  process.parentPort.postMessage(getMagicMessage());

  return (options) => {
    return createTransport(options, async (request: TransportRequest): Promise<TransportMakeRequestResponse> => {
      await sendEnvelope(request.body);
      // Since the main process handles sending of envelopes and rate limiting, we always return 200 OK
      return { statusCode: 200 };
    });
  };
}
