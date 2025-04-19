import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'node',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Unhanded promise rejection in main process',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    filename: expect.stringContaining('app:///src/main.'),
                    module: expect.any(String),
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                    in_app: true,
                    pre_context: expect.any(Array),
                    context_line: expect.any(String),
                    post_context: expect.any(Array),
                  },
                ]),
              },
              mechanism: { type: 'onunhandledrejection', handled: false },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
        extra: {
          unhandledPromiseRejection: true,
        },
      }),
    })
    .run();
});
