import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'node',
        exception: expect.any(Object),
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
        extra: {
          unhandledPromiseRejection: true,
        },
        breadcrumbs: expect.arrayContaining([
          {
            timestamp: expect.any(Number),
            type: 'http',
            category: 'electron.net',
            data: expect.objectContaining({
              url: 'http://localhost:8123/something',
              method: 'GET',
            }),
          },
        ]),
      }),
    })
    .run();
});
