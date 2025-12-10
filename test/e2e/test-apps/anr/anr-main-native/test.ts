import { expect } from 'vitest';
import {
  electronTestRunner,
  eventEnvelopeNoLiveContext,
  ISO_DATE_MATCHER,
  sessionEnvelope,
  UUID_MATCHER,
} from '../../..';

electronTestRunner(
  __dirname,
  { skip: (electronVersion) => electronVersion.major < 28 || electronVersion.major > 37 },
  async (ctx) => {
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
            release: 'anr-main-native@1.0.0',
            environment: 'development',
          }),
        }),
      })
      .expect({
        envelope: eventEnvelopeNoLiveContext({
          contexts: {
            trace: undefined,
          },
          breadcrumbs: undefined,
          platform: 'node',
          level: 'error',
          exception: {
            values: [
              {
                type: 'EventLoopBlocked',
                value: 'Event Loop Blocked for at least 1000 ms',
                thread_id: '0',
                stacktrace: {
                  frames: expect.arrayContaining([
                    {
                      filename: expect.stringContaining('app:///src/main.'),
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
          threads: {
            values: [
              {
                crashed: true,
                current: true,
                id: '0',
                main: true,
                name: 'main',
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
  },
);
