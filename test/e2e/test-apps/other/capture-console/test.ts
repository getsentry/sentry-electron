import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        message: 'This is an error message',
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
              value: 'This is an error message',
            },
          ],
        },
        extra: {
          arguments: ['This is an error message'],
        },
        logger: 'console',
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        request: {
          headers: {},
          url: 'app:///src/index.html',
        },
      }),
    })
    .run();
});
