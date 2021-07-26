import { Transports } from '@sentry/node';
import { Event, Response, SentryRequest, SentryRequestType, Status, TransportOptions } from '@sentry/types';
import { logger, PromiseBuffer, SentryError, timestampWithMs } from '@sentry/utils';
import { app, net } from 'electron';
import { Readable, Writable } from 'stream';
import * as url from 'url';
import { createGzip } from 'zlib';

/**
 * Returns a promise that resolves when app is ready.
 */
async function isAppReady(): Promise<boolean> {
  return (
    app.isReady() ||
    new Promise<boolean>((resolve) => {
      app.once('ready', () => {
        resolve(true);
      });
    })
  );
}

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * SentryElectronRequest
 */
export interface SentryElectronRequest extends Omit<SentryRequest, 'body'> {
  body: string | Buffer;
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

/** Using net module of Electron */
export class ElectronNetTransport extends Transports.BaseTransport {
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

    if (this._isRateLimited(type)) {
      return Promise.reject(
        new SentryError(`Transport locked till ${JSON.stringify(this._rateLimits, null, 2)} due to too many requests.`),
      );
    }

    const eventPayload = JSON.stringify(event);
    const bodyBuffer = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${eventPayload}\n`);

    return this.sendRequest({
      body: bodyBuffer,
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
      type,
    });
  }

  /**
   * Checks if a category is rate-limited
   */
  public isRateLimited(category: SentryRequestType): boolean {
    return this._isRateLimited(category);
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
      () =>
        new Promise<Response>((resolve, reject) => {
          const req = net.request(options as Electron.ClientRequestConstructorOptions);
          req.on('error', reject);
          req.on('response', (res: Electron.IncomingMessage) => {
            res.on('error', reject);

            const status = Status.fromHttpCode(res.statusCode);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status });
            } else {
              if (status === Status.RateLimit) {
                let retryAfterHeader = res.headers ? res.headers['retry-after'] : '';
                retryAfterHeader = (Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader) as string;

                let rlHeader = res.headers ? res.headers['x-sentry-rate-limits'] : '';
                rlHeader = (Array.isArray(rlHeader) ? rlHeader[0] : rlHeader) as string;

                const headers = {
                  'x-sentry-rate-limits': rlHeader,
                  'retry-after': retryAfterHeader,
                };

                const limited = this._handleRateLimit(headers);
                if (limited) logger.warn(`Too many requests, backing off until: ${this._disabledUntil(request.type)}`);
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
          bodyStream.pipe(req as any as Writable);
        }),
    );
  }
}
