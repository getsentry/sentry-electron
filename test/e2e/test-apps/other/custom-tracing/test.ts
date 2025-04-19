import { expect } from 'vitest';

import { electronTestRunner, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser Tracing fails on Electron v24
    skip: (electronVersion) => electronVersion.major === 24,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: transactionEnvelope({
          platform: 'node',
          type: 'transaction',
          transaction: 'InitSequence',
          transaction_info: {
            source: 'custom',
          },
          contexts: {
            trace: expect.objectContaining({
              trace_id: UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              data: expect.objectContaining({
                'sentry.origin': 'manual',
                'sentry.sample_rate': 1,
                'sentry.source': 'custom',
              }),
              op: 'task',
              origin: 'manual',
            }),
          },
          spans: expect.arrayContaining([
            {
              data: {
                'sentry.origin': 'manual',
              },
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
              description: 'initializeServices',
              origin: 'manual',
              status: 'ok',
            },
          ]),
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'browser',
          },
        }),
      })
      .run();
  },
);
