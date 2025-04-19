import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some preload error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    filename: expect.stringContaining('app:///src/preload.'),
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                    in_app: true,
                    pre_context: expect.any(Array),
                    context_line: expect.stringContaining("throw new Error('Some preload error')"),
                    post_context: expect.any(Array),
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
          url: 'app:///src/index.html',
        },
      }),
    })
    .run();
});
