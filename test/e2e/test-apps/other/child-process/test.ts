import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'warning',
        platform: 'node',
        message: "'GPU' process exited with 'killed'",
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'GPU',
        },
      }),
    })
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
                frames: [
                  {
                    colno: expect.any(Number),
                    filename: 'app:///src/index.html',
                    function: '?',
                    in_app: true,
                    lineno: expect.any(Number),
                  },
                ],
              },
              mechanism: {
                handled: false,
                type: 'instrument',
                data: {
                  function: 'setTimeout',
                },
              },
            },
          ],
        },
        extra: {
          arguments: [],
        },
        request: {
          headers: {},
          url: 'app:///src/index.html',
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        breadcrumbs: expect.arrayContaining([
          {
            timestamp: expect.any(Number),
            type: 'process',
            category: 'child-process',
            message: "'GPU' process exited with 'killed'",
            level: 'warning',
            data: expect.objectContaining({
              type: 'GPU',
              reason: 'killed',
            }),
          },
        ]),
      }),
    })
    .run();
});
