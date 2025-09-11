import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { runTwice: true, timeout: 25_000 }, async (ctx) => {
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
                    filename: 'app:///src/index.html',
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                    in_app: true,
                  },
                ]),
              },
              mechanism: {
                type: 'auto.browser.browserapierrors.setTimeout',
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
          url: 'app:///src/index.html',
        },
      }),
    })
    .run();
});
