// tslint:disable:no-unsafe-any

import { Event } from '@sentry/types';
import bodyParser = require('body-parser');
import express = require('express');
import finalhandler = require('finalhandler');
import { readFileSync } from 'fs';
import { createServer, Server } from 'http';
import { Form } from 'multiparty';

/** Event payload that has been submitted to the test server. */
export interface TestServerEvent {
  /** Request ID (UUID) */
  id: string;
  /** Public auth key from the DSN. */
  sentry_key: string;
  /** Sentry Event data (should conform to the SentryEvent interface). */
  data: Event;
  /** An optional minidump file, if included in the event. */
  dump_file?: Buffer;
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
  private server?: Server;

  /** Starts accepting requests. */
  public start(): void {
    const app = express();
    app.use(bodyParser.json());

    // Handles the Sentry store endpoint
    app.post('/api/:id/store', (req, res) => {
      const auth = (req.headers['x-sentry-auth'] as string) || '';
      const keyMatch = auth.match(/sentry_key=([a-f0-9]*)/);
      if (!keyMatch) {
        res.status(400);
        res.end('Missing authentication header');
        return;
      }

      this.events.push({
        data: req.body as Event,
        id: req.params.id,
        sentry_key: keyMatch[1],
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    // Handles the Sentry minidump endpoint
    app.post('/api/:id/minidump', (req, res) => {
      const form = new Form();
      form.parse(req, (_, fields, files) => {
        this.events.push({
          data: JSON.parse(fields.sentry[0]) as Event,
          dump_file: readFileSync(files.upload_file_minidump[0].path),
          id: req.params.id,
          sentry_key: req.originalUrl.replace(/.*sentry_key=/, ''),
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Success');
      });
    });

    this.server = createServer((req, res) => {
      app(req as any, res as any, finalhandler(req, res));
    });

    // Changed to port to 8123 because sentry uses 8000 if run locally
    this.server.listen(8123);
  }

  public clearEvents(): void {
    this.events = [];
  }

  /** Stops accepting requests and closes the server. */
  public async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.server.close(e => {
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
