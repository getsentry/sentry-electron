import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope, UUID_V4_MATCHER } from '../../test/e2e';

electronTestRunner(__dirname, { skipEsmAutoTransform: true, skip: () => process.platform === 'linux' }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some renderer error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    filename: expect.stringContaining('app:///.vite/renderer/main_window/assets/index'),
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                    in_app: true,
                  },
                ]),
              },
              mechanism: {
                type: 'instrument',
                handled: false,
                data: {
                  function: 'setTimeout',
                },
              },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        extra: {
          arguments: [],
        },
        request: {
          headers: {},
          url: 'app:///.vite/renderer/main_window/index.html',
        },
        debug_meta: {
          images: [
            {
              code_file: expect.stringContaining('app:///.vite/renderer/main_window/assets/index'),
              debug_id: UUID_V4_MATCHER,
              type: 'sourcemap',
            },
          ],
        },
      }),
    })
    .run();
});
