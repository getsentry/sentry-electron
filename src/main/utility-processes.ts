import { captureEvent, getClient } from '@sentry/node';
import { Attachment, Event } from '@sentry/types';
import { logger, parseEnvelope } from '@sentry/utils';
import * as electron from 'electron';

import { eventFromEnvelope } from '../common/envelope';
import { getMagicMessage, isMagicMessage } from '../common/ipc';
import { mergeEvents } from './merge';

function log(message: string): void {
  logger.log(`[Utility Process] ${message}`);
}

/**
 * We wrap `electron.utilityProcess.fork` so we can pass a messageport to any SDK running in the utility process
 */
export function configureUtilityProcessIPC(): void {
  if (!electron.utilityProcess?.fork) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  electron.utilityProcess.fork = new Proxy(electron.utilityProcess.fork, {
    apply: (target, thisArg, args: Parameters<typeof electron.utilityProcess.fork>) => {
      // Call the underlying function to get the child process
      const child: electron.UtilityProcess = target.apply(thisArg, args);

      function getProcessName(): string {
        const [, , options] = args;
        return options?.serviceName || `pid:${child.pid}`;
      }

      // We don't send any messages unless we've heard from the child SDK. At that point we know it's ready to receive
      // and will also filter out any messages we send so users don't see them
      child.on('message', (msg: unknown) => {
        if (isMagicMessage(msg)) {
          log(`SDK started in utility process '${getProcessName()}'`);

          const { port1, port2 } = new electron.MessageChannelMain();

          port2.on('message', (msg) => {
            if (msg.data instanceof Uint8Array || typeof msg.data === 'string') {
              handleEnvelopeFromUtility(msg.data);
            }
          });

          // Send one side of the message port to the child SDK
          child.postMessage(getMagicMessage(), [port1]);
        }
      });

      // We proxy child.on so we can filter messages from the child SDK and ensure that users do not see them
      // eslint-disable-next-line @typescript-eslint/unbound-method
      child.on = new Proxy(child.on, {
        apply: (target, thisArg, [event, listener]) => {
          if (event === 'message') {
            return target.apply(thisArg, [
              'message',
              (msg: unknown) => {
                if (isMagicMessage(msg)) {
                  return;
                }

                return listener(msg);
              },
            ]);
          }

          return target.apply(thisArg, [event, listener]);
        },
      });

      return child;
    },
  });
}

function handleEnvelopeFromUtility(env: Uint8Array | string): void {
  const envelope = parseEnvelope(env);

  const eventAndAttachments = eventFromEnvelope(envelope);
  if (eventAndAttachments) {
    const [event, attachments] = eventAndAttachments;

    captureEventFromUtility(event, attachments);
  } else {
    // Pass other types of envelope straight to the transport
    void getClient()?.getTransport()?.send(envelope);
  }
}

function captureEventFromUtility(event: Event, attachments: Attachment[]): void {
  // Remove the environment as it defaults to 'production' and overwrites the main process environment
  delete event.environment;
  delete event.release;

  // Remove the SDK info as we want the Electron SDK to be the one reporting the event
  delete event.sdk?.name;
  delete event.sdk?.version;
  delete event.sdk?.packages;

  captureEvent(mergeEvents(event, { tags: { 'event.process': 'utility' } }), { attachments });
}
