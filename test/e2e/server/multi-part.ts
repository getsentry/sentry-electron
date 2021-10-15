import { Event } from '@sentry/types';
import * as Busboy from 'busboy';
import * as Koa from 'koa';
import * as Router from 'koa-tree-router';
import { createGunzip } from 'zlib';

import { createLogger } from '../utils';

const log = createLogger('Test Server Parser');

export interface MultipartResult {
  fields: { [key: string]: any };
  files: { [key: string]: number };
}

export function parse_multipart(
  ctx: Koa.ParameterizedContext<any, Router.IRouterParamContext<any, any>, any>,
): Promise<MultipartResult> {
  return new Promise((resolve) => {
    const busboy = new Busboy({ headers: ctx.headers });
    const output: MultipartResult = { fields: {}, files: {} };

    busboy.on('file', (fieldName, file) => {
      let size = 0;
      file.on('data', (data) => {
        size += data.length;
      });
      file.on('end', () => {
        output.files[fieldName] = size;
      });
    });
    busboy.on('field', (fieldName, val) => {
      output.fields[fieldName] = val;
    });
    busboy.on('finish', function () {
      resolve(output);
    });

    if (ctx.request.headers['content-encoding'] === 'gzip') {
      ctx.req.pipe(createGunzip()).pipe(busboy);
    } else {
      ctx.req.pipe(busboy);
    }
  });
}

function sentryNamespacedFormFields(form: MultipartResult): Record<string, any> {
  return Object.entries(form.fields)
    .filter(([key, _]) => key.startsWith('sentry___'))
    .reduce((acc, [key, value]) => {
      acc[key.replace('sentry___', '')] = JSON.parse(value);
      return acc;
    }, {} as Record<string, any>);
}

export function sentryEventFromFormFields(form: MultipartResult): [Event, Record<string, any>] {
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
