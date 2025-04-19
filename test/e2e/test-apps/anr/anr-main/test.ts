import { expect } from 'vitest';

import {
  electronTestRunner,
  eventEnvelopeNoLiveContext,
  ISO_DATE_MATCHER,
  sessionEnvelope,
  UUID_MATCHER,
} from '../../..';

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
          release: 'anr-main@1.0.0',
          environment: 'development',
        }),
      }),
    })
    .expect({
      envelope: eventEnvelopeNoLiveContext({
        platform: 'node',
        level: 'error',
        exception: {
          values: [
            {
              type: 'ApplicationNotResponding',
              value: 'Application Not Responding for at least 1000 ms',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    filename: expect.stringContaining('app:///src/main.'),
                    module: expect.stringContaining('main'),
                    function: 'longWork',
                    colno: expect.any(Number),
                    lineno: expect.any(Number),
                    in_app: true,
                  },
                ]),
              },
              mechanism: { type: 'ANR' },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
        debug_meta: {
          images: [
            {
              type: 'sourcemap',
              code_file: expect.stringContaining('app:///src/main.'),
              debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
            },
          ],
        },
      }),
    })
    .run();
});
