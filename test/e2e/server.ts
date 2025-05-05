import { Envelope, Event, parseEnvelope } from '@sentry/core';
import Busboy from 'busboy';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-tree-router';
import { Readable } from 'stream';
import { createGunzip, gunzipSync } from 'zlib';
import { delay } from '../helpers';
import { TestLogger } from './utils';

export const SERVER_PORT = 8123;
export const RATE_LIMIT_ID = 666;
export const ERROR_ID = 999;
export const HANG_ID = 777;

interface MultipartResult {
  fields: { [key: string]: any };
  files: { [key: string]: Buffer };
}

export interface MinidumpResult {
  event: Event;
  namespacedData: Record<string, any>;
  dumpFile: Buffer;
}

function sentryNamespacedFormFields(form: MultipartResult): Record<string, any> {
  return Object.entries(form.fields)
    .filter(([key, _]) => key.startsWith('sentry___'))
    .reduce((acc, [key, value]) => {
      acc[key.replace('sentry___', '')] = JSON.parse(value);
      return acc;
    }, {} as Record<string, any>);
}

export function sentryEventFromFormFields(logger: TestLogger, form: MultipartResult): [Event, Record<string, any>] {
  const log = logger.createLogger('Test Server - Event parser');

  let json = '';
  let count = 1;

  while (`sentry__${count}` in form.fields) {
    json += form.fields[`sentry__${count}`];
    count += 1;
  }

  if ('sentry' in form.fields) {
    json = form.fields.sentry;
  }

  try {
    return [json === '' ? {} : JSON.parse(json), sentryNamespacedFormFields(form)];
  } catch (error) {
    log('Failed to parse form data', error);
  }

  return [{}, {}];
}

export function parseMultipart(
  ctx: Koa.ParameterizedContext<any, Router.IRouterParamContext<any, any>, any>,
): Promise<MultipartResult> {
  return new Promise((resolve) => {
    const busboy = Busboy({ headers: ctx.headers });
    const output: MultipartResult = { fields: {}, files: {} };

    busboy.on('file', (fieldName, file) => {
      const buf: Buffer[] = [];
      file.on('data', (data) => {
        buf.push(data);
      });
      file.on('end', () => {
        output.files[fieldName] = Buffer.concat(buf);
      });
    });
    busboy.on('field', (fieldName, val) => {
      output.fields[fieldName] = val;
    });
    busboy.on('close', function () {
      resolve(output);
    });

    if (ctx.request.headers['content-encoding'] === 'gzip') {
      ctx.req.pipe(createGunzip()).pipe(busboy);
    } else {
      ctx.req.pipe(busboy);
    }
  });
}

function stream2buffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buf: Buffer[] = [];
    stream.on('data', (chunk) => buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buf)));
    stream.on('error', (err) => reject(err));
  });
}

async function getRequestBody(ctx: Koa.ParameterizedContext): Promise<Buffer> {
  let buf = await stream2buffer(ctx.req);

  if (ctx.request.headers['content-encoding'] === 'gzip') {
    buf = gunzipSync(buf);
  }

  return buf;
}

export interface TestServer {
  readonly port: number;
  close(): Promise<void>;
}

export function createSentryTestServer(
  logger: TestLogger,
  callback: (event: Envelope | MinidumpResult) => void,
): TestServer {
  const log = logger.createLogger('Test Server');

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

    if (ctx.params.id === HANG_ID.toString()) {
      await delay(10_000);
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
    callback(envelope);

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

      const result = await parseMultipart(ctx);
      const [event, namespacedData] = sentryEventFromFormFields(logger, result);

      callback({
        event,
        namespacedData,
        dumpFile: result.files.upload_file_minidump as Buffer,
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

  const server = app.listen(0);
  const info = server.address();
  if (!info || typeof info === 'string') {
    throw new Error('Failed to get server address');
  }
  const port = info.port;

  return {
    get port(): number {
      return port;
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
