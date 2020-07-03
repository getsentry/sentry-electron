import { Transports } from '@sentry/node';
import { Event, Response, Status, TransportOptions } from '@sentry/types';
import { PromiseBuffer, SentryError } from '@sentry/utils';
import { net } from 'electron';

import { isAppReady } from '../backend';

/** Using net module of electron */
export class NetTransport extends Transports.BaseTransport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: Event): Promise<Response> {
    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    await isAppReady();
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const req = net.request(this._getRequestOptions() as Electron.ClientRequestConstructorOptions);
        req.on('error', reject);
        req.on('response', (res: Electron.IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              status: Status.fromHttpCode(res.statusCode),
            });
          } else {
            // tslint:disable:no-unsafe-any
            if (res.headers && res.headers['x-sentry-error']) {
              let reason: string | string[] = res.headers['x-sentry-error'];
              if (Array.isArray(reason)) {
                reason = reason.join(', ');
              }
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
        req.write(JSON.stringify(event));
        req.end();
      }),
    );
  }
}
