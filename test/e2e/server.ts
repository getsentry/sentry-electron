// tslint:disable:no-unsafe-any

import { Event } from '@sentry/types';
import bodyParser = require('body-parser');
import express = require('express');
import finalhandler = require('finalhandler');
import { createServer, Server } from 'http';
import * as multer from 'multer';
import { join } from 'path';

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
    const app = express();

    app.use(
      // eslint-disable-next-line deprecation/deprecation
      bodyParser.raw({
        inflate: true,
        limit: '200mb',
        type: 'application/x-sentry-envelope',
      }),
    );

    // Handles the Sentry envelope endpoint
    app.post('/api/:id/envelope', (req, res) => {
      const auth = (req.headers['x-sentry-auth'] as string) || '';
      const keyMatch = auth.match(/sentry_key=([a-f0-9]*)/);
      if (!keyMatch) {
        res.status(400);
        res.end('Missing authentication header');
        return;
      }

      const envelope = req.body.toString().split('\n');

      this.events.push({
        data: JSON.parse(envelope[2]) as Event,
        dump_file: envelope[4] !== undefined,
        id: req.params.id,
        sentry_key: keyMatch[1],
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    const upload = multer({
      dest: join(__dirname, '.dumps'),
    }).single('upload_file_minidump');

    // Handles the Sentry minidump endpoint
    app.post('/api/:id/minidump', upload, (req, res) => {
      const key = req.originalUrl.match(/sentry_key=([a-f0-9]*)/);

      this.events.push({
        data: {},
        dump_file: !!req.file?.filename,
        id: req.params.id,
        sentry_key: key ? key[1] : '',
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    this._server = createServer((req, res) => {
      app(req as any, res as any, finalhandler(req, res));
    });

    // Changed to port to 8123 because sentry uses 8000 if run locally
    this._server.listen(8123);
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
