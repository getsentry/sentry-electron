import { Event, Session } from '@sentry/types';
import { Server } from 'http';
import * as Koa from 'koa';
import * as bodyParser from 'koa-bodyparser';
import * as Router from 'koa-tree-router';
import { inspect } from 'util';

import { parse_multipart, sentryEventFromFormFields } from './multi-part';

/** Event payload that has been submitted to the test server. */
export interface TestServerEvent<T = unknown> {
  /** Request ID (UUID) */
  appId: string;
  /** Public auth key from the DSN. */
  sentryKey: string;
  /** Extra namespaced form data */
  namespacedData?: { [key: string]: any };
  /** An optional minidump file, if included in the event. */
  dumpFile?: boolean;
  /** API method used for submission */
  method: 'envelope' | 'minidump' | 'store';
  /** Sentry Event data */
  data: T;
}

/**
 * A mock Sentry server.
 *
 * Use `server.start()` to start execution and `server.stop()` to terminate it.
 */
export class TestServer {
  /** All events received by this server instance. */
  public events: TestServerEvent[] = [];
  /** The internal HTTP server. */
  private _server?: Server;

  /** Starts accepting requests. */
  public start(): void {
    const app = new Koa();

    app.use(
      bodyParser({
        enableTypes: ['text'],
        extendTypes: {
          text: ['application/x-sentry-envelope'],
        },
        textLimit: '200mb',
      }),
    );

    const router = new Router();

    // Handles the Sentry envelope endpoint
    router.post('/api/:id/envelope/', async (ctx) => {
      const auth = (ctx.headers['x-sentry-auth'] as string) || '';
      const keyMatch = auth.match(/sentry_key=([a-f0-9]*)/);
      if (!keyMatch) {
        ctx.status = 403;
        ctx.body = 'Missing authentication header';
        return;
      }

      const [, itemHeaders, payload, attachmentHeaders, attachment] = ctx.request.body.toString().split('\n');

      const { type } = JSON.parse(itemHeaders) as { type: string | 'event' | 'session' };

      if (type === 'session') {
        this._addEvent({
          data: JSON.parse(payload) as Session,
          dumpFile: false,
          appId: ctx.params.id,
          sentryKey: keyMatch[1],
          method: `envelope`,
        });
      } else {
        this._addEvent({
          data: JSON.parse(payload) as Event,
          dumpFile: !!attachmentHeaders && !!attachment && attachment.startsWith('MDMP'),
          appId: ctx.params.id,
          sentryKey: keyMatch[1],
          method: `envelope`,
        });
      }

      ctx.status = 200;
      ctx.body = 'Success';
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

        const result = await parse_multipart(ctx);
        const [event, namespaced] = sentryEventFromFormFields(result);
        const dump_file = result.files.upload_file_minidump != undefined && result.files.upload_file_minidump > 1024;

        this._addEvent({
          data: event,
          namespacedData: namespaced,
          dumpFile: dump_file,
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
        dumpFile: false,
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

    this._server = app.listen(8123);
  }

  public clearEvents(): void {
    this.events = [];
  }

  /** Stops accepting requests and closes the server. */
  public async stop(): Promise<void> {
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

  private _addEvent(event: TestServerEvent): void {
    this.events.push(event);

    if (process.env.DEBUG_SERVER) {
      console.log(inspect(event, false, null, true));
    }
  }
}
