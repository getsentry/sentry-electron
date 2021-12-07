import { Response, Status, TransportOptions } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';
import { join } from 'path';

import { sentryCachePath } from '../fs';
import { ElectronNetTransport, HTTPError, SentryElectronRequest } from './electron-net';
import { PersistedRequestQueue } from './queue';

const START_DELAY = 5_000;

/** Returns true is there's a chance we're online */
function maybeOnline(): boolean {
  return !('online' in net) || net.online === true;
}

/** Using net module of Electron */
export class ElectronOfflineNetTransport extends ElectronNetTransport {
  private _queue: PersistedRequestQueue = new PersistedRequestQueue(join(sentryCachePath, 'queue'));
  private _url: string = this._api.getEnvelopeEndpointWithUrlEncodedAuth();
  private _retryDelay: number = START_DELAY;

  /** Create a new instance  */
  public constructor(public options: TransportOptions) {
    super(options);

    this._flushQueue();
  }

  /**
   * @inheritDoc
   */
  public async sendRequest(request: SentryElectronRequest): Promise<Response> {
    if (maybeOnline()) {
      try {
        const response = await super.sendRequest(request);
        this._requestSuccess();
        return response;
      } catch (error) {
        if (error instanceof HTTPError && error.status != Status.RateLimit) {
          logger.log('Dropping request');
          // We don't queue HTTP errors that are not rate limited
          throw error;
        } else {
          logger.log('Error sending', error);
        }
      }
    } else {
      logger.log(`Currently Offline. Not sending '${request.type}' request. `);
    }

    return await this._queueRequest(request);
  }

  /** Records successful submission */
  private _requestSuccess(): void {
    logger.log(`Successfully sent`);
    // Reset the retry delay
    this._retryDelay = START_DELAY;
    // We were successful so check the queue
    this._flushQueue();
  }

  /** Queues a failed request */
  private async _queueRequest(request: SentryElectronRequest): Promise<Response> {
    logger.log(`Queuing request`);
    await this._queue.add(request);

    setTimeout(() => {
      this._flushQueue();
    }, this._retryDelay);

    this._retryDelay *= 3;

    return { status: Status.Unknown };
  }

  /** Attempts to send the first event in the queue if one is found */
  private _flushQueue(): void {
    void this._queue.pop(this._url).then((found) => {
      if (found) {
        logger.log(`Found a request in the queue`);
        void this.sendRequest(found);
      }
    });
  }
}
