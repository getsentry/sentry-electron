import {
  BaseTransportOptions,
  createTransport,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';

import { getMagicMessage, isMagicMessage } from '../common/ipc';

/**
 * Creates a Transport that passes envelopes to the Electron main process.
 */
export function makeUtilityProcessTransport(): (options: BaseTransportOptions) => Transport {
  let mainMessagePort: Electron.MessagePortMain | undefined;

  async function sendEnvelope(envelope: string | Uint8Array): Promise<void> {
    let count = 0;

    // mainMessagePort is undefined until the main process sends us the message port
    while (mainMessagePort === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      count += 1;

      // After 5 seconds, we give up waiting for the main process to send us the message port
      if (count >= 50) {
        throw new Error('Timeout waiting for message port to send event to main process');
      }
    }

    mainMessagePort.postMessage(envelope);
  }

  // Receive the messageport from the main process
  process.parentPort.on('message', (msg) => {
    if (isMagicMessage(msg.data)) {
      const [port] = msg.ports;
      mainMessagePort = port;
      mainMessagePort?.start();
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
