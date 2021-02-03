import { Transports } from '@sentry/node';
import { Event, Response, SentryRequest, Status, TransportOptions } from '@sentry/types';
import { parseRetryAfterHeader, PromiseBuffer, SentryError, timestampWithMs } from '@sentry/utils';
import { net } from 'electron';
import { Readable, Writable } from 'stream';
import * as url from 'url';
import { createGzip } from 'zlib';

import { isAppReady } from '../backend';

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * SentryElectronRequest
 */
export interface SentryElectronRequest extends Omit<SentryRequest, 'body'> {
  body: string | Buffer;
  contentType: string;
}

/**
 * Gets a stream from a Buffer or string
 * We don't have Readable.from in earlier versions of node
 */
function streamFromBody(body: Buffer | string): Readable {
  return new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
}

/** Using net module of electron */
export class NetTransport extends Transports.BaseTransport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Locks transport after receiving 429 response */
  private _rateLimits: Record<string, Date> = {};

  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: Event): Promise<Response> {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      // Internal helper that uses `perf_hooks` to get clock reading
      sent_at: new Date(timestampWithMs() * 1000).toISOString(),
    });
    const type = event.type === 'transaction' ? 'transaction' : 'event';
    const itemHeaders = JSON.stringify({
      content_type: 'application/json',
      // Internal helper that uses `perf_hooks` to get clock reading
      type: event.type === 'transaction' ? 'transaction' : 'event',
    });

    if (this.isRateLimited(type)) {
      return Promise.reject(
        new SentryError(`Transport locked till ${JSON.stringify(this._rateLimits, null, 2)} due to too many requests.`),
      );
    }

    const eventPayload = JSON.stringify(event);
    const bodyBuffer = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${eventPayload}\n`);

    return this.sendRequest({
      body: bodyBuffer,
      contentType: 'application/x-sentry-envelope',
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
      type,
    });
  }

  /**
   * Checks if a category is ratelimited
   */
  public isRateLimited(category: string): boolean {
    const disabledUntil = this._rateLimits[category] || this._rateLimits.all;
    // tslint:disable-next-line
    if (new Date(Date.now()) < disabledUntil) {
      return true;
    }
    return false;
  }

  /**
   * Dispatches a Request to Sentry. Only handles SentryRequest
   */
  public async sendRequest(request: SentryElectronRequest): Promise<Response> {
    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }

    await isAppReady();

    const options = this._getRequestOptions(new url.URL(request.url));
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/x-sentry-envelope',
    };

    let bodyStream = streamFromBody(request.body);

    if (request.body.length > GZIP_THRESHOLD) {
      options.headers['Content-Encoding'] = 'gzip';
      bodyStream = bodyStream.pipe(createGzip());
    }

    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const options = this._getRequestOptions(new url.URL(request.url));
        options.headers = {
          ...options.headers,
          'Content-Type': request.contentType,
        };

        const req = net.request(options as Electron.ClientRequestConstructorOptions);
        req.on('error', reject);
        req.on('response', (res: Electron.IncomingMessage) => {
          const status = Status.fromHttpCode(res.statusCode);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status });
          } else {
            if (status === Status.RateLimit) {
              this._handleRateLimit(res.headers);
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

        // The docs say that ClientRequest is Writable but the types don't match exactly
        bodyStream.pipe((req as any) as Writable);
      }),
    );
  }

  /**
   * Sets internal _rateLimits from incoming headers
   */
  private _handleRateLimit(headers: Record<string, string[] | string>): void {
    this._rateLimits = {};
    const now = Date.now();
    if (headers['x-sentry-rate-limits']) {
      let rateLimitHeader = Array.isArray(headers['x-sentry-rate-limits'])
        ? headers['x-sentry-rate-limits'][0]
        : headers['x-sentry-rate-limits'];
      rateLimitHeader = rateLimitHeader.trim();
      const quotas = rateLimitHeader.split(',');
      const preRateLimits: Record<string, number> = {};
      for (const quota of quotas) {
        const parameters = quota.split(':');
        const headerDelay = parseInt(`${parameters[0]}`, 10);
        let delay = 60 * 1000; // 60secs default
        if (!isNaN(headerDelay)) {
          // so it is a number ^^
          delay = headerDelay * 1000; // to have time in secs
        }
        const categories = parameters[1].split(';');
        if (categories.length === 1 && categories[0] === '') {
          preRateLimits.all = delay;
        } else {
          for (const category of categories) {
            preRateLimits[category] = Math.max(preRateLimits[category] || 0, delay);
          }
        }
      }
      for (const key of Object.keys(preRateLimits)) {
        this._rateLimits[key] = new Date(now + preRateLimits[key]);
      }
    } else if (headers['retry-after']) {
      const retryAfterHeader = Array.isArray(headers['retry-after'])
        ? headers['retry-after'][0]
        : headers['retry-after'];

      this._rateLimits.all = new Date(now + parseRetryAfterHeader(now, retryAfterHeader));
    }
  }
}
