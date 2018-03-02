import * as bodyParser from 'body-parser';
import * as finalhandler from 'finalhandler';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as multiparty from 'multiparty';
import * as Router from 'router';
import * as zlib from 'zlib';

interface TestServerEvent {
  id: string;
  sentry_key: string;
  data: any;
  dump_file?: Buffer;
}

export class TestServer {
  public events: TestServerEvent[] = [];
  private server: http.Server;

  public start(): void {
    const router = Router({}) as any;
    router.use(bodyParser.raw());

    // Handles the Sentry store endpoint
    router.post('/api/:id/store', (req, res) => {
      const keyMatch = req.headers['x-sentry-auth'].match(
        /sentry_key=([a-f0-9]*)/,
      );

      this.events.push({
        id: req.params.id,
        sentry_key: keyMatch[1],
        data: this.getBase64AndDecompress(req.body),
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    // Handles the Sentry minidump endpoint
    router.post('/api/:id/minidump', (req, res) => {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
        this.events.push({
          id: req.params.id,
          sentry_key: req.originalUrl.replace(/.*sentry_key=/, ''),
          data: JSON.parse(fields.sentry[0]),
          dump_file: readFileSync(files.upload_file_minidump[0].path),
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Success');
      });
    });

    this.server = http.createServer((req: any, res: any) => {
      router(req, res, finalhandler(req, res));
    });

    this.server.listen(8000);
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private getBase64AndDecompress(raw: Buffer): string {
    const base64Str = raw.toString();
    const compressed = Buffer.from(base64Str, 'base64');
    return JSON.parse(zlib.inflateSync(compressed).toString());
  }
}
