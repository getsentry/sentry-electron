import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope, ISO_DATE_MATCHER, sessionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, { skip: (electronVersion) => electronVersion.major < 28 }, async (ctx) => {
  await ctx
    .includeSessionEnvelopes()
    .ignoreExpectationOrder()
    .expect({
      envelope: sessionEnvelope({
        sid: UUID_MATCHER,
        init: true,
        started: ISO_DATE_MATCHER,
        timestamp: ISO_DATE_MATCHER,
        status: 'abnormal',
        errors: 0,
        duration: expect.any(Number),
        abnormal_mechanism: 'anr_foreground',
        attrs: expect.objectContaining({
          release: 'anr-renderer@1.0.0',
          environment: 'development',
        }),
      }),
    })
    .expect({
      envelope: eventEnvelope({
        platform: 'node',
        level: 'error',
        exception: {
          values: [
            {
              type: 'ApplicationNotResponding',
              value: 'Application Not Responding for at least 1000 ms',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    filename: 'app:///src/index.html',
                    module: expect.stringContaining('index.html'),
                    function: 'longWork',
                    colno: expect.any(Number),
                    lineno: expect.any(Number),
                    in_app: true,
                  }),
                ]),
              },
              mechanism: { type: 'ANR' },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
      }),
    })
    .run();
});
