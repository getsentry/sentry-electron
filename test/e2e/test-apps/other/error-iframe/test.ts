import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

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
              value: 'Some iframe error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    colno: expect.any(Number),
                    filename: 'app:///dist/iframe.js',
                    function: '?',
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
        extra: {
          arguments: [],
        },
        request: {
          headers: {},
          url: 'app:///dist/iframe.html',
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
