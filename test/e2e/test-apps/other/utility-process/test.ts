import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'fatal',
        platform: 'node',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some utility error',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    colno: expect.any(Number),
                    filename: 'app:///src/utility.js',
                    function: expect.any(String),
                    in_app: true,
                    lineno: expect.any(Number),
                  }),
                ]),
              },
              mechanism: {
                handled: false,
                type: 'onuncaughtexception',
              },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'utility',
        },
      }),
    })
    .run();
});
