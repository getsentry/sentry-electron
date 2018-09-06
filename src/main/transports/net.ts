import { SentryError } from '@sentry/core';
import { Transports } from '@sentry/node';
import { SentryEvent, SentryResponse, Status, TransportOptions } from '@sentry/types';
import { serialize } from '@sentry/utils/object';
import {
  net,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';
import { isAppReady } from '../backend';

/** Using net module of electron */
export class NetTransport extends Transports.BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    await isAppReady();
    return new Promise<SentryResponse>((resolve, reject) => {
      const req = net.request(this.getRequestOptions());
      req.on('error', reject);
      req.on('response', (res: Electron.IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            status: Status.fromHttpCode(res.statusCode),
          });
        } else {
          // tslint:disable:no-unsafe-any
          if (res.headers && res.headers['x-sentry-error']) {
            const reason = res.headers['x-sentry-error'];
            // tslint:enable:no-unsafe-any
            reject(new SentryError(`HTTP Error (${res.statusCode}): ${reason}`));
          } else {
            reject(new SentryError(`HTTP Error (${res.statusCode})`));
          }
        }
        // force the socket to drain
        res.on('data', () => {
          // Drain
        });
        res.on('end', () => {
          // Drain
        });
      });
      req.write(serialize(event));
      req.end();
    });
  }
}
