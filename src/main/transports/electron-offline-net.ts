import { Response, Status, TransportOptions } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';
import { join } from 'path';

import { sentryCachePath } from '../fs';
import { ElectronNetTransport, SentryElectronRequest } from './electron-net';
import { PersistedRequestQueue } from './queue';

/** Returns true is there's a chance we're online */
function maybeOnline(): boolean {
  return !('online' in net) || net.online === true;
}

/** Using net module of Electron */
export class ElectronOfflineNetTransport extends ElectronNetTransport {
  private _queue: PersistedRequestQueue = new PersistedRequestQueue(join(sentryCachePath, 'queue'));
  private _url: string = this._api.getEnvelopeEndpointWithUrlEncodedAuth();

  /** Create a new instance  */
  public constructor(public options: TransportOptions) {
    super(options);

    this.flushQueue();
  }

  /**
   * @inheritDoc
   */
  public async sendRequest(request: SentryElectronRequest): Promise<Response> {
    if (maybeOnline()) {
      try {
        logger.log(`Sending '${request.type}' request`);
        const response = await super.sendRequest(request);
        this.flushQueue();
        return response;
      } catch (e) {
        logger.warn('Error sending', e);
      }
    } else {
      logger.log(`Not sending '${request.type}' request. Offline.`);
    }

    logger.log(`Queuing request`);
    await this._queue.add(request);
    return { status: Status.Unknown };
  }

  /** Attempts to send the first event in the queue if one is found */
  public flushQueue(): void {
    void this._queue.pop(this._url).then((found) => {
      if (found) {
        logger.log(`Found a request in the queue`);
        void this.sendRequest(found);
      }
    });
  }
}
