import * as bodyParser from 'body-parser';
import * as finalhandler from 'finalhandler';
import * as http from 'http';
import * as multiparty from 'multiparty';
import * as Router from 'router';
import * as zlib from 'zlib';

interface TestServerEvent {
  id: string;
  native: boolean;
  sentry_key: string;
  data: any;
}

export class TestServer {
  public events: TestServerEvent[] = [];
  private server: http.Server;

  public start() {
    const router = Router({}) as any;
    router.use(bodyParser.json());
    router.use(bodyParser.raw());
    router.use(bodyParser.urlencoded({ extended: true }));

    router.post('/api/:id/store', (req, res) => {
      const match = req.headers['x-sentry-auth'].match(/sentry_key=([a-f0-9]*)/);

      this.events.push({
        id: req.params.id,
        native: false,
        sentry_key: match[1],
        data: this.getData(req.body)
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Success');
    });

    router.post('/api/:id/minidump', (req, res) => {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
        // console.log('file', files.upload_file_minidump[0]);

        this.events.push({
          id: req.params.id,
          native: true,
          sentry_key: req.originalUrl.replace(/.*sentry_key=/, ''),
          data: JSON.parse(fields.sentry[0]),
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Success');
      });

    });

    this.server = http.createServer((req, res) => {
      router(req, res, finalhandler(req, res));
    })
      .listen(8000);
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private getData(raw: Buffer) {
    const base64Str = raw.toString();
    const compressed = Buffer.from(base64Str, 'base64');
    return JSON.parse(zlib.inflateSync(compressed).toString());
  }
}
