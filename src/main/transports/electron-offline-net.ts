import { Response, TransportOptions } from '@sentry/types';

import { ElectronNetTransport, SentryElectronRequest } from './electron-net';

/** Using net module of Electron */
export class ElectronOfflineNetTransport extends ElectronNetTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async sendRequest(request: SentryElectronRequest): Promise<Response> {
    return super.sendRequest(request);
  }
}
