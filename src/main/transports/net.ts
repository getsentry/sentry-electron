import { Transports } from '@sentry/node';
import { SentryEvent, SentryResponse, TransportOptions } from '@sentry/types';
import {
  net,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';

/** Using net module of electron */
export class NetTransport extends Transports.HTTPSTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(net as any, event);
  }
}
