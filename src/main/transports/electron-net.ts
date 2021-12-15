import { Transports } from '@sentry/node';
import {
  Event,
  Response,
  SentryRequest,
  SentryRequestType,
  SessionAggregates,
  SessionContext,
  Status,
  TransportOptions,
} from '@sentry/types';
import { logger, PromiseBuffer } from '@sentry/utils';
import { net } from 'electron';
import { Readable, Writable } from 'stream';
import * as url from 'url';
import { createGzip } from 'zlib';

import { getSdkInfo } from '../context';
import { whenAppReady } from '../electron-normalize';

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/** Wraps HTTP errors and includes the status */
export class HTTPError extends Error {
  public constructor(public readonly status: Status, message: string) {
    super(message);
  }
}

/**
 * SentryElectronRequest
 */
export interface SentryElectronRequest extends Omit<SentryRequest, 'body'> {
  body: string | Buffer;
  date?: Date;
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

  /** Create a new instance */
  public constructor(public options: TransportOptions) {
    super(options);
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: Event): Promise<Response> {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
    });
    const type = event.type || 'event';
    const itemHeaders = JSON.stringify({ type });

    if (this._isRateLimited(type)) {
      throw new HTTPError(
        Status.RateLimit,
        `Transport locked till ${JSON.stringify(this._rateLimits, null, 2)} due to too many requests.`,
      );
    }

    const eventPayload = JSON.stringify(event);
    const body = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${eventPayload}\n`);

    return this.sendRequest({
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
      body,
      type,
    });
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: SessionContext | SessionAggregates): Promise<Response> {
    const { name, version } = getSdkInfo();

    const envelopeHeaders = JSON.stringify({
      sent_at: new Date().toISOString(),
      sdk: { name, version },
    });

    // I know this is hacky but we don't want to add `session` to request type since it's never rate limited
    const type = 'aggregates' in session ? ('sessions' as SentryRequestType) : 'session';
    const itemHeaders = JSON.stringify({ type });
    const sessionPayload = JSON.stringify(session);
    const body = Buffer.from(`${envelopeHeaders}\n${itemHeaders}\n${sessionPayload}\n`);

    return this.sendRequest({
      url: this._api.getEnvelopeEndpointWithUrlEncodedAuth(),
      body,
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
    logger.log(`Sending '${request.type}' request`);

    if (!this._buffer.isReady()) {
      throw new HTTPError(Status.Unknown, 'Not adding Promise due to buffer limit reached.');
    }

    if (this._isRateLimited(request.type)) {
      throw new HTTPError(
        Status.RateLimit,
        `Transport for ${request.type} requests locked till ${this._disabledUntil(
          request.type,
        )} due to too many requests.`,
      );
    }

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

    await whenAppReady;

    return this._buffer.add(
      () =>
        new Promise<Response>((resolve, reject) => {
          const req = net.request(options as Electron.ClientRequestConstructorOptions);
          req.on('error', reject);
          req.on('response', (res: Electron.IncomingMessage) => {
            res.on('error', reject);

            const status = Status.fromHttpCode(res.statusCode);
            if (status === Status.Success) {
              resolve({ status });
            } else {
              if (status === Status.RateLimit) {
                let retryAfterHeader = res.headers ? res.headers['retry-after'] : '';
                retryAfterHeader = (Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader) as string;

                let rlHeader = res.headers ? res.headers['x-sentry-rate-limits'] : '';
                rlHeader = (Array.isArray(rlHeader) ? rlHeader[0] : rlHeader) as string;

                if (this._handleRateLimit({ 'x-sentry-rate-limits': rlHeader, 'retry-after': retryAfterHeader })) {
                  logger.warn(`Too many requests, backing off until: ${this._disabledUntil(request.type)}`);
                }
              }

              if (res.headers && res.headers['x-sentry-error']) {
                let reason: string | string[] = res.headers['x-sentry-error'];
                if (Array.isArray(reason)) {
                  reason = reason.join(', ');
                }

                reject(new HTTPError(status, `HTTP Error (${res.statusCode}): ${reason}`));
              } else {
                reject(new HTTPError(status, `HTTP Error (${res.statusCode})`));
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
          bodyStream.pipe(req as unknown as Writable);
        }),
    );
  }
}
