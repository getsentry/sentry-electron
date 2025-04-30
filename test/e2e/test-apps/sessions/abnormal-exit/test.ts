import { expect } from 'vitest';

import { electronTestRunner, ISO_DATE_MATCHER, sessionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(
  __dirname,
  { runTwice: true, timeout: 25_000, skip: () => process.platform !== 'darwin' },
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
          status: 'ok',
          errors: 0,
          duration: expect.any(Number),
          attrs: expect.objectContaining({
            environment: 'development',
            release: 'session-abnormal-exit@1.0.0',
          }),
        }),
      })
      .expect({
        envelope: sessionEnvelope({
          sid: UUID_MATCHER,
          init: true,
          started: ISO_DATE_MATCHER,
          timestamp: ISO_DATE_MATCHER,
          status: 'ok',
          errors: 0,
          duration: expect.any(Number),
          attrs: expect.objectContaining({
            environment: 'development',
            release: 'session-abnormal-exit@1.0.0',
          }),
        }),
      })
      .expect({
        envelope: sessionEnvelope({
          sid: UUID_MATCHER,
          init: false,
          started: ISO_DATE_MATCHER,
          timestamp: ISO_DATE_MATCHER,
          status: 'abnormal',
          errors: 1,
          duration: expect.any(Number),
          attrs: expect.objectContaining({
            environment: 'development',
            release: 'session-abnormal-exit@1.0.0',
          }),
        }),
      })
      .run();
  },
);
