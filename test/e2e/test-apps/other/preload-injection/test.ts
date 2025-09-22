import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope, UUID_V4_MATCHER } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true, skip: () => process.platform === 'linux' }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        debug_meta: {
          images: [
            {
              code_file: 'app:///dist/renderer.js',
              type: 'sourcemap',
              debug_id: UUID_V4_MATCHER,
            },
          ],
        },
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some renderer error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    colno: expect.any(Number),
                    filename: 'app:///dist/renderer.js',
                    function: expect.any(String),
                    in_app: true,
                    lineno: expect.any(Number),
                  },
                ]),
              },
              mechanism: {
                handled: false,
                type: 'auto.browser.browserapierrors.setTimeout',
              },
            },
          ],
        },
        request: {
          headers: {},
          url: 'app:///dist/index.html',
        },
        extra: {
          arguments: [],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        user: {
          id: 'abc-123',
        },
      }),
    })
    .run();
});
