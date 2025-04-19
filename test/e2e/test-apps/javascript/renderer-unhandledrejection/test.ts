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
              value: 'Unhanded promise rejection in renderer process',
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
                type: 'onunhandledrejection',
                handled: false,
              },
            },
          ],
        },
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
