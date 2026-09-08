import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'node',
        logger: 'console',
        message: '[object Object]',
        exception: {
          values: [
            {
              mechanism: {
                handled: true,
                synthetic: true,
                type: 'auto.core.capture_console',
              },
              stacktrace: {
                frames: expect.any(Array),
              },
              value: '[object Object]',
            },
          ],
        },
        extra: { arguments: [{ data: 1, self: '[Object]' }] },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
      }),
    })
    .run();
});
