import { eventToSentryRequest } from '@sentry/core';
import { Transports } from '@sentry/node';
import { Event, Response, Status, TransportOptions } from '@sentry/types';
import { logger, parseRetryAfterHeader, PromiseBuffer, SentryError } from '@sentry/utils';
import { net } from 'electron';
import * as url from 'url';

import { isAppReady } from '../backend';

/** Using net module of electron */
export class NetTransport extends Transports.BaseTransport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Locks transport after receiving 429 response */
  private _netDisabledUntil: Date = new Date(Date.now());

  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: Event): Promise<Response> {
    // tslint:disable-next-line
    if (new Date(Date.now()) < this._netDisabledUntil) {
      return Promise.reject(
        new SentryError(`Transport locked till ${this._netDisabledUntil.toString()} due to too many requests.`),
      );
    }
    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    await isAppReady();
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const sentryReq = eventToSentryRequest(event, this._api);
        const options = this._getRequestOptions(new url.URL(sentryReq.url));

        const req = net.request(options as Electron.ClientRequestConstructorOptions);
        req.on('error', reject);
        req.on('response', (res: Electron.IncomingMessage) => {
          const status = Status.fromHttpCode(res.statusCode);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status });
          } else {
            if (status === Status.RateLimit) {
              const now = Date.now();
              let header = res.headers ? res.headers['Retry-After'] : '';
              header = Array.isArray(header) ? header[0] : header;
              this._netDisabledUntil = new Date(now + parseRetryAfterHeader(now, header));
              logger.warn(`Too many requests, backing off till: ${this._netDisabledUntil.toString()}`);
            }

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
