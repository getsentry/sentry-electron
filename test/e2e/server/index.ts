import { Event, Session, Transaction } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';
import { Server } from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-tree-router';
import { Readable } from 'stream';
import { inspect } from 'util';
import { gunzipSync } from 'zlib';

import { parseEnvelope } from '../../../src/main/envelope';
import { eventIsSession } from '../recipe';
import { createLogger } from '../utils';
import { parseMultipart, sentryEventFromFormFields } from './multi-part';

const log = createLogger('Test Server');

export const SERVER_PORT = 8123;
export const RATE_LIMIT_ID = 666;
export const ERROR_ID = 999;

interface Attachment {
  filename?: string;
  content_type?: string;
  attachment_type?: string;
}

/** Event payload that has been submitted to the test server. */
export interface TestServerEvent<T = unknown> {
  /** Request ID (UUID) */
  appId: string;
  /** Public auth key from the DSN. */
  sentryKey: string;
  /** Sentry Event data */
  data: T;
  /** Extra namespaced form data */
  namespacedData?: Record<string, any>;
  /** Attachments */
  attachments?: Attachment[];
  /** API method used for submission */
  method: 'envelope' | 'minidump' | 'store';
}

function stream2buffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buf: Buffer[] = [];
    stream.on('data', (chunk) => buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buf)));
    stream.on('error', (err) => reject(err));
  });
}

async function getRequestBody(
  ctx: Koa.ParameterizedContext<any, Router.IRouterParamContext<any, any>, any>,
): Promise<Buffer> {
  let buf = await stream2buffer(ctx.req);

  if (ctx.request.headers['content-encoding'] === 'gzip') {
    buf = gunzipSync(buf);
  }

  return buf;
}

/**
 * A mock Sentry server.
 *
 * Use `server.start()` to start execution and `server.stop()` to terminate it.
 */
export class TestServer {
  /** All events received by this server instance. */
  public events: TestServerEvent<Event | Transaction | Session>[] = [];
  /** The internal HTTP server. */
  private _server?: Server;

  /** Starts accepting requests. */
  public start(): void {
    log('Starting test server');

    const app = new Koa();

    app.use(
      bodyParser({
        enableTypes: ['text'],
        textLimit: '200mb',
      }),
    );

    const router = new Router();

    // Handles the Sentry envelope endpoint
    router.post('/api/:id/envelope/', async (ctx) => {
      if (ctx.params.id === RATE_LIMIT_ID.toString()) {
        ctx.status = 429;
        ctx.body = 'Rate Limited';
        ctx.set({
          'x-Sentry-rate-limits': '60::organization, 2700::organization',
        });
        return;
      }

      if (ctx.params.id === ERROR_ID.toString()) {
        ctx.status = 500;
        ctx.body = 'Server Error';
        return;
      }

      const auth = (ctx.headers['x-sentry-auth'] as string) || ctx.url;
      const keyMatch = auth.match(/sentry_key=([a-f0-9]*)/);
      if (!keyMatch) {
        ctx.status = 403;
        ctx.body = 'Missing authentication header';
        return;
      }

      const envelope = parseEnvelope(await getRequestBody(ctx));

      let data: Event | Transaction | Session | undefined;
      const attachments: Attachment[] = [];

      forEachEnvelopeItem(envelope, ([headers, item]) => {
        if (headers.type === 'event' || headers.type === 'transaction' || headers.type === 'session') {
          data = item as Event | Transaction | Session;
        }

        if (headers.type === 'attachment') {
          attachments.push(headers);
        }
      });

      if (data) {
        this._addEvent({
          data,
          attachments,
          appId: ctx.params.id,
          sentryKey: keyMatch[1],
          method: 'envelope',
        });

        ctx.status = 200;
        ctx.body = 'Success';
      } else {
        ctx.status = 500;
        ctx.body = 'Invalid envelope';
      }
    });

    // Handles the Sentry minidump endpoint
    router.post('/api/:id/minidump/', async (ctx) => {
      if (ctx.request.is('multipart/*')) {
        const keyMatch = ctx.originalUrl.match(/sentry_key=([a-f0-9]*)/);
        if (!keyMatch) {
          ctx.status = 403;
          ctx.body = 'Missing authentication header';
          return;
        }

        const result = await parseMultipart(ctx);
        const [event, namespacedData] = sentryEventFromFormFields(result);
        const dumpFile = result.files.upload_file_minidump != undefined && result.files.upload_file_minidump > 1024;

        const attachments = dumpFile ? [{ attachment_type: 'event.minidump' }] : [];

        this._addEvent({
          data: event,
          namespacedData,
          attachments,
          appId: ctx.params.id,
          sentryKey: keyMatch[1],
          method: 'minidump',
        });

        ctx.status = 200;
        ctx.body = 'Success';
        return;
      }
    });

    // Handles the Sentry store endpoint
    router.post('/api/:id/store/', async (ctx) => {
      const keyMatch = ctx.url.match(/sentry_key=([a-f0-9]*)/);

      if (!keyMatch) {
        ctx.status = 403;
        ctx.body = 'Missing authentication header';
        return;
      }

      const event = JSON.parse(ctx.request.body as string);

      this._addEvent({
        data: event,
        appId: ctx.params.id,
        sentryKey: keyMatch[1],
        method: 'store',
      });

      ctx.headers['Content-Type'] = 'text/plain; charset=utf-8';
      ctx.body = 'Success';
    });

    app.use(router.routes());

    if (process.env.DEBUG) {
      app.on('error', (err: Error, _ctx: Koa.Context) => {
        console.error(err);
      });
    }

    this._server = app.listen(SERVER_PORT);
  }

  public clearEvents(): void {
    this.events = [];
  }

  /** Stops accepting requests and closes the server. */
  public async stop(): Promise<void> {
    log('Stopping test server');

    return new Promise<void>((resolve, reject) => {
      if (this._server) {
        this._server.close((e) => {
          if (e) {
            reject(e);
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error('Invariant violation: Call .start() first'));
      }
    });
  }

  private _addEvent(event: TestServerEvent<Event | Transaction | Session>): void {
    const type = eventIsSession(event.data) ? 'session' : 'event';
    log(`Received '${type}' on '${event.method}' endpoint`, inspect(event, false, null, true));
    this.events.push(event);
  }
}
