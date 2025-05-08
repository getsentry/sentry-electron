import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'fatal',
        platform: 'node',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some main error',
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
                    context_line: expect.stringContaining("throw new Error('Some main error');"),
                    post_context: expect.any(Array),
                  },
                ]),
              },
              mechanism: { type: 'generic', handled: false },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
        release: 'custom-name',
      }),
    })
    .run();
});
