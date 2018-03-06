import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as finalhandler from 'finalhandler';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as multiparty from 'multiparty';
import * as zlib from 'zlib';

/**
 * Decodes and deflates a ZIP payload in base64 representation.
 *
 * @param raw The raw base64 encoded input.
 * @returns A decoded object.
 */
function deflateBase64ZIP(raw: Buffer): any {
  const base64Str = raw.toString();
  const compressed = Buffer.from(base64Str, 'base64');
  return JSON.parse(zlib.inflateSync(compressed).toString());
}

/** Event payload that has been submitted to the test server. */
export interface TestServerEvent {
  /** Request ID (UUID) */
  id: string;
  /** Public auth key from the DSN. */
  sentry_key: string;
  /** Sentry Event data (should conform to the SentryEvent interface). */
  data: any;
  /** An optional minidump file, if included in the event. */
  dump_file?: Buffer;
}

/**
 * A mock Sentry server.
 *
 * Use `server.start()` to start execution and `server.stop()` to terminate it.
 * Note that you must call stop after every test, so place it in `afterEach`
 * or make sure it is called in a finally-block.
 */
export class TestServer {
  /** All events received by this server instance. */
  public events: TestServerEvent[] = [];
  /** The internal HTTP server. */
  private server?: http.Server;

  /** Starts accepting requests. */
  public start(): void {
    const app = express();
    app.use(bodyParser.raw());

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
        data: deflateBase64ZIP(req.body),
        id: req.params.id,
        sentry_key: keyMatch[1],
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    // Handles the Sentry minidump endpoint
    app.post('/api/:id/minidump', (req, res) => {
      const form = new multiparty.Form();
      form.parse(req, (_, fields, files) => {
        this.events.push({
          data: JSON.parse(fields.sentry[0]),
          dump_file: readFileSync(files.upload_file_minidump[0].path),
          id: req.params.id,
          sentry_key: req.originalUrl.replace(/.*sentry_key=/, ''),
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Success');
      });
    });

    this.server = http.createServer((req: any, res: any) => {
      app(req, res, finalhandler(req, res));
    });

    this.server.listen(8000);
  }

  /** Stops accepting requests and closes the server. */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        reject(new Error('Invariant violation: Call .start() first'));
      }
    });
  }
}
