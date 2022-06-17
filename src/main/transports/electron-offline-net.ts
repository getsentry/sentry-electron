import { createTransport } from '@sentry/core';
import { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';
import { join } from 'path';

import { sentryCachePath } from '../fs';
import { createElectronNetRequestExecutor, ElectronNetTransportOptions } from './electron-net';
import { PersistedRequestQueue } from './queue';

type BeforeSendResponse = 'send' | 'queue' | 'drop';

export interface ElectronOfflineTransportOptions extends ElectronNetTransportOptions {
  beforeSend?: (request: TransportRequest) => BeforeSendResponse;
}

const START_DELAY = 5_000;
const MAX_DELAY = 2_000_000_000;

/** Returns true is there's a chance we're online */
function maybeOnline(): boolean {
  return !('online' in net) || net.online === true;
}

function defaultBeforeSend(_: TransportRequest): BeforeSendResponse {
  return maybeOnline() ? 'send' : 'queue';
}

function isRateLimited(result: TransportMakeRequestResponse): boolean {
  return !!(result.headers && 'x-sentry-rate-limits' in result.headers);
}

/**
 * Creates a Transport that uses Electrons net module to send events to Sentry. When they fail to send they are
 * persisted to disk and sent later
 */
export function makeElectronOfflineTransport(options: ElectronOfflineTransportOptions): Transport {
  const netMakeRequest = createElectronNetRequestExecutor(options.url, options.headers || {});
  const queue: PersistedRequestQueue = new PersistedRequestQueue(join(sentryCachePath, 'queue'));
  let retryDelay: number = START_DELAY;

  function flushQueue(): void {
    queue
      .pop()
      .then((found) => {
        if (found) {
          logger.log('Found a request in the queue');
          makeRequest(found).catch((e) => logger.error(e));
        }
      })
      .catch((e) => logger.error(e));
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

  async function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    let result = (options.beforeSend || defaultBeforeSend)(request);

    if (result === 'send') {
      try {
        const result = await netMakeRequest(request);

        if (isRateLimited(result)) {
          logger.log('Rate limited', result.headers);
        } else {
          logger.log('Successfully sent');
          // Reset the retry delay
          retryDelay = START_DELAY;
          // We were successful so check the queue
          flushQueue();
          return result;
        }
      } catch (error) {
        logger.log('Error sending:', error);
        result = 'queue';
      }
    }

    if (result == 'queue') {
      return await queueRequest(request);
    }

    logger.log('Dropping request');
    return {};
  }

  flushQueue();

  return createTransport(options, makeRequest);
}
