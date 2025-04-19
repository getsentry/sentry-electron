import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope, UUID_V4_MATCHER } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true, skip: () => process.platform === 'linux' }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'fatal',
        platform: 'node',
        debug_meta: {
          images: [
            {
              code_file: 'app:///dist/main.js',
              type: 'sourcemap',
              debug_id: UUID_V4_MATCHER,
            },
          ],
        },
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some main error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    colno: expect.any(Number),
                    filename: 'app:///dist/main.js',
                    function: expect.any(String),
                    in_app: true,
                    lineno: expect.any(Number),
                    module: 'dist:main',
                  },
                ]),
              },
              mechanism: {
                handled: false,
                type: 'generic',
              },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
        user: {
          id: 'abc-123',
        },
      }),
    })
    .run();
});
