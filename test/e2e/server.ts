import { Event } from '@sentry/types';
import { Server } from 'http';
import * as Koa from 'koa';
import * as bodyParser from 'koa-bodyparser';
import * as Router from 'koa-tree-router';

import { parse_multipart } from './multi-part';

/** Event payload that has been submitted to the test server. */
export interface TestServerEvent {
  /** Request ID (UUID) */
  id: string;
  /** Public auth key from the DSN. */
  sentry_key: string;
  /** Sentry Event data (should conform to the SentryEvent interface). */
  data: Event;
  /** An optional minidump file, if included in the event. */
  dump_file?: boolean;
  /** API method used for submission */
  method: 'envelope' | 'minidump';
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
      }),
    );

    const router = new Router();

    // Handles the Sentry envelope endpoint
    router.post('/api/:id/envelope/', async ctx => {
      const auth = (ctx.headers['x-sentry-auth'] as string) || '';
      const keyMatch = auth.match(/sentry_key=([a-f0-9]*)/);
      if (!keyMatch) {
        ctx.status = 403;
        ctx.body = 'Missing authentication header';
        return;
      }

      const envelope = ctx.request.body.toString().split('\n');

      this.events.push({
        data: JSON.parse(envelope[2]) as Event,
        dump_file: envelope[4] !== undefined,
        id: ctx.params.id,
        sentry_key: keyMatch[1],
        method: 'envelope',
      });

      ctx.status = 200;
      ctx.body = 'Success';
    });

    // Handles the Sentry minidump endpoint
    router.post('/api/:id/minidump/', async ctx => {
      if (ctx.request.is('multipart/*')) {
        const keyMatch = ctx.originalUrl.match(/sentry_key=([a-f0-9]*)/);
        if (!keyMatch) {
          ctx.status = 403;
          ctx.body = 'Missing authentication header';
          return;
        }

        const result = await parse_multipart(ctx);

        this.events.push({
          data: {},
          dump_file: result.files.upload_file_minidump != undefined && result.files.upload_file_minidump > 1024,
          id: ctx.params.id,
          sentry_key: keyMatch[1],
          method: 'minidump',
        });

        ctx.status = 200;
        ctx.body = 'Success';
        return;
      }
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
        this._server.close(e => {
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
}
