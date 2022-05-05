import { createTransport } from '@sentry/core';
import { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';
import { join } from 'path';

import { sentryCachePath } from '../fs';
import { createElectronNetRequestExecutor, ElectronNetTransportOptions } from './electron-net';
import { PersistedRequestQueue } from './queue';

const START_DELAY = 5_000;
const MAX_DELAY = 2_000_000_000;

/** Returns true is there's a chance we're online */
function maybeOnline(): boolean {
  return !('online' in net) || net.online === true;
}

function noOp(): void {
  //
}

/** */
export function makeElectronNetOfflineTransport(options: ElectronNetTransportOptions): Transport {
  const netMakeRequest = createElectronNetRequestExecutor(options.url, options.headers || {});
  const queue: PersistedRequestQueue = new PersistedRequestQueue(join(sentryCachePath, 'queue'));
  let retryDelay: number = START_DELAY;

  function flushQueue(): void {
    queue
      .pop()
      .then((found) => {
        if (found) {
          logger.log('Found a request in the queue');
          makeRequest(found).catch(noOp);
        }
      })
      .catch(noOp);
  }

  async function queueRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    logger.log('Queuing request');
    await queue.add(request);

    setTimeout(() => {
      flushQueue();
    }, retryDelay);

    retryDelay *= 3;

    // If the delay is bigger than 2^31 (max signed 32-bit int), setTimeout throws
    // an error and falls back to 1 which can cause a huge number of requests.
    if (retryDelay > MAX_DELAY) {
      retryDelay = MAX_DELAY;
    }

    return {};
  }

  function requestSuccess(): void {
    logger.log('Successfully sent');
    // Reset the retry delay
    retryDelay = START_DELAY;
    // We were successful so check the queue
    flushQueue();
  }

  async function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    if (maybeOnline()) {
      try {
        const result = await netMakeRequest(request);
        requestSuccess();
        return result;
      } catch (error) {
        logger.log('Error sending:', error);
      }
    } else {
      logger.log('Not sending, currently Offline.');
    }

    return await queueRequest(request);
  }

  flushQueue();

  return createTransport(options, makeRequest);
}
