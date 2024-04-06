import { createTransport } from '@sentry/core';
import { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';
import { join } from 'path';

import { getSentryCachePath } from '../electron-normalize';
import { createElectronNetRequestExecutor, ElectronNetTransportOptions } from './electron-net';
import { PersistedRequestQueue } from './queue';

type BeforeSendResponse = 'send' | 'queue' | 'drop';

export interface ElectronOfflineTransportOptions extends ElectronNetTransportOptions {
  /**
   * The maximum number of days to keep an event in the queue.
   */
  maxQueueAgeDays?: number;

  /**
   * The maximum number of events to keep in the queue.
   */
  maxQueueCount?: number;

  /**
   * Called every time the number of requests in the queue changes.
   */
  queuedLengthChanged?: (length: number) => void;

  /**
   * Called before attempting to send an event to Sentry.
   *
   * Return 'send' to attempt to send the event.
   * Return 'queue' to queue and persist the event for sending later.
   * Return 'drop' to drop the event.
   */
  beforeSend?: (request: TransportRequest) => BeforeSendResponse | Promise<BeforeSendResponse>;
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
  const queue: PersistedRequestQueue = new PersistedRequestQueue(
    join(getSentryCachePath(), 'queue'),
    options.maxQueueAgeDays,
    options.maxQueueCount,
  );

  const beforeSend = options.beforeSend || defaultBeforeSend;

  let retryDelay: number = START_DELAY;
  let lastQueueLength = -1;

  function queueLengthChanged(queuedEvents: number): void {
    if (options.queuedLengthChanged && queuedEvents !== lastQueueLength) {
      lastQueueLength = queuedEvents;
      options.queuedLengthChanged(queuedEvents);
    }
  }

  function flushQueue(): void {
    queue
      .pop()
      .then((found) => {
        if (found) {
          // We have pendingCount plus found.request
          queueLengthChanged(found.pendingCount + 1);
          logger.log('Found a request in the queue');
          makeRequest(found.request).catch((e) => logger.error(e));
        } else {
          queueLengthChanged(0);
        }
      })
      .catch((e) => logger.error(e));
  }

  async function queueRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    logger.log('Queuing request');
    queueLengthChanged(await queue.add(request));

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
    let action = beforeSend(request);

    if (action instanceof Promise) {
      action = await action;
    }

    if (action === 'send') {
      try {
        const result = await netMakeRequest(request);

        if (!isRateLimited(result)) {
          logger.log('Successfully sent');
          // Reset the retry delay
          retryDelay = START_DELAY;
          // We were successful so check the queue
          flushQueue();
          return result;
        } else {
          logger.log('Rate limited', result.headers);
        }
      } catch (error) {
        logger.log('Error sending:', error);
      }

      action = 'queue';
    }

    if (action == 'queue') {
      return queueRequest(request);
    }

    logger.log('Dropping request');
    return {};
  }

  flushQueue();

  return createTransport(options, makeRequest);
}
