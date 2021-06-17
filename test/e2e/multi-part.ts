import { Event } from '@sentry/types';
import * as Busboy from 'busboy';
import * as Koa from 'koa';
import * as Router from 'koa-tree-router';
import { createGunzip } from 'zlib';

export interface MultipartResult {
  fields: { [key: string]: any };
  files: { [key: string]: number };
}

export function parse_multipart(
  ctx: Koa.ParameterizedContext<any, Router.IRouterParamContext<any, any>, any>,
): Promise<MultipartResult> {
  return new Promise(resolve => {
    const busboy = new Busboy({ headers: ctx.headers });
    const output: MultipartResult = { fields: {}, files: {} };

    busboy.on('file', (fieldName, file) => {
      let size = 0;
      file.on('data', data => {
        size += data.length;
      });
      file.on('end', () => {
        output.files[fieldName] = size;
      });
    });
    busboy.on('field', (fieldName, val) => {
      output.fields[fieldName] = val;
    });
    busboy.on('finish', function() {
      resolve(output);
    });

    if (ctx.request.headers['content-encoding'] === 'gzip') {
      ctx.req.pipe(createGunzip()).pipe(busboy);
    } else {
      ctx.req.pipe(busboy);
    }
  });
}

function sentryNamespacedFormFields(form: MultipartResult): { [key: string]: any } {
  return Object.entries(form.fields)
    .filter(([key, _]) => key.startsWith('sentry___'))
    .reduce((acc, [key, value]) => {
      acc[key.replace('sentry___', '')] = JSON.parse(value);
      return acc;
    }, {} as { [key: string]: any });
}

export function sentryEventFromFormFields(form: MultipartResult): [Event, { [key: string]: any }] {
  if ('sentry' in form.fields) {
    try {
      const event = JSON.parse(form.fields.sentry);
      const namespaced = sentryNamespacedFormFields(form);
      return [event, namespaced];
    } catch (e) {
      //
    }
  }

  let count = 1;
  let json = '';

  while (`sentry__${count}` in form.fields) {
    json += form.fields[`sentry__${count}`];
    count += 1;
  }

  try {
    const event = json === '' ? {} : JSON.parse(json);
    const namespaced = sentryNamespacedFormFields(form);
    return [event, namespaced];
  } catch (e) {
    //
  }

  return [{}, {}];
}
