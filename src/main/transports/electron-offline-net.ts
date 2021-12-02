import { Response, Status, TransportOptions } from '@sentry/types';
import { logger } from '@sentry/utils';
import { net } from 'electron';

import { ElectronNetTransport, SentryElectronRequest } from './electron-net';
import { PersistedRequestQueue } from './queue';

/** Using net module of Electron */
export class ElectronOfflineNetTransport extends ElectronNetTransport {
  private _queue: PersistedRequestQueue = new PersistedRequestQueue(30, 30);
  private _url: string = this._api.getEnvelopeEndpointWithUrlEncodedAuth();

  /** Create a new instance  */
  public constructor(public options: TransportOptions) {
    super(options);

    void this.flushQueue();
  }

  /**
   * @inheritDoc
   */
  public async sendRequest(request: SentryElectronRequest): Promise<Response> {
    // If this version of Electron doesn't support 'online` detection or it does and it's true
    if (!('online' in net) || net.online === true) {
      try {
        logger.log(`Attempting to send ${request.type}`);
        const response = await super.sendRequest(request);
        void this.flushQueue();
        return response;
      } catch (e) {
        logger.warn(e);
      }
    }

    await this._queue.add(request);
    return { status: Status.Unknown };
  }

  /** */
  public async flushQueue(): Promise<void> {
    const found = await this._queue.pop(this._url);

    if (found) {
      await this.sendRequest(found);
    }
  }
}
