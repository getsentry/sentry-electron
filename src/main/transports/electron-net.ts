import {
  BaseTransportOptions,
  createTransport,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
  TransportRequestExecutor,
} from '@sentry/core';
import { app, net } from 'electron';
import { Readable, Writable } from 'stream';
import { URL } from 'url';
import { createGzip } from 'zlib';

export interface ElectronNetTransportOptions extends BaseTransportOptions {
  /** Define custom headers */
  headers?: Record<string, string>;
}

// Estimated maximum size for reasonable standalone event
const GZIP_THRESHOLD = 1024 * 32;

/**
 * Gets a stream from a Buffer or string
 * We don't have Readable.from in earlier versions of node
 */
function streamFromBody(body: string | Uint8Array): Readable {
  return new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
}

function getRequestOptions(url: string): Electron.ClientRequestConstructorOptions {
  const { hostname, pathname, port, protocol, search } = new URL(url);

  return {
    method: 'POST',
    hostname,
    path: `${pathname}${search}`,
    port: parseInt(port, 10),
    protocol,
  };
}

/**
 * Creates a Transport that uses Electrons net module to send events to Sentry.
 */
export function makeElectronTransport(options: ElectronNetTransportOptions): Transport {
  return createTransport(options, createElectronNetRequestExecutor(options.url, options.headers || {}));
}

/**
 * Creates a RequestExecutor to be used with `createTransport`.
 */
export function createElectronNetRequestExecutor(
  url: string,
  baseHeaders: Record<string, string>,
): TransportRequestExecutor {
  baseHeaders['Content-Type'] = 'application/x-sentry-envelope';

  return function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    return app.whenReady().then(
      () =>
        new Promise((resolve, reject) => {
          let bodyStream = streamFromBody(request.body);

          const headers = { ...baseHeaders };

          if (request.body.length > GZIP_THRESHOLD) {
            headers['content-encoding'] = 'gzip';
            bodyStream = bodyStream.pipe(createGzip());
          }

          const req = net.request(getRequestOptions(url));

          for (const [header, value] of Object.entries(headers)) {
            req.setHeader(header, value);
          }

          req.on('response', (res) => {
            res.on('error', reject);

            res.on('data', () => {
              // Drain socket
            });

            res.on('end', () => {
              // Drain socket
            });

            // "Key-value pairs of header names and values. Header names are lower-cased."
            // https://nodejs.org/api/http.html#http_message_headers
            const retryAfterHeader = res.headers['retry-after'] ?? null;
            const rateLimitsHeader = res.headers['x-sentry-rate-limits'] ?? null;

            resolve({
              statusCode: res.statusCode,
              headers: {
                'retry-after': Array.isArray(retryAfterHeader) ? retryAfterHeader[0] || null : retryAfterHeader,
                'x-sentry-rate-limits': Array.isArray(rateLimitsHeader)
                  ? rateLimitsHeader[0] || null
                  : rateLimitsHeader,
              },
            });
          });

          req.on('error', reject);

          // The docs say that ClientRequest is Writable but the types don't match exactly
          bodyStream.pipe(req as unknown as Writable);
        }),
    );
  };
}
