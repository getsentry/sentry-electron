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

export function sentryEventFromFormFields(result: MultipartResult): any {
  if ('sentry' in result.fields) {
    try {
      return JSON.parse(result.fields.sentry);
    } catch (e) {
      //
    }
  }

  let count = 1;
  let json = '';

  while (`sentry__${count}` in result.fields) {
    json += result.fields[`sentry__${count}`];
    count += 1;
  }

  try {
    return JSON.parse(json);
  } catch (e) {
    //
  }

  return {};
}
