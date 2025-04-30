import { Envelope } from '@sentry/core';
import { expect } from 'vitest';

import { electronTestRunner, getSessionFromEnvelope, ISO_DATE_MATCHER, sessionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(
  __dirname,
  { runTwice: true, timeout: 50_000, skip: () => process.platform !== 'darwin' },
  async (ctx) => {
    let firstSessionId: string | undefined;

    await ctx
      .includeSessionEnvelopes()
      .ignoreExpectationOrder()
      .expect({
        envelope: (envelope: Envelope) => {
          const session = getSessionFromEnvelope(envelope);
          firstSessionId = session?.sid;
          expect(firstSessionId).toBeDefined();

          expect(
            sessionEnvelope({
              sid: UUID_MATCHER,
              did: 'some_user',
              init: true,
              started: ISO_DATE_MATCHER,
              timestamp: ISO_DATE_MATCHER,
              status: 'ok',
              errors: 0,
              duration: expect.any(Number),
              attrs: expect.objectContaining({
                environment: 'development',
                release: 'session-abnormal-exit-electron-uploader@1.0.0',
              }),
            }),
          ).toEqual(envelope);
        },
      })
      .expect({
        envelope: sessionEnvelope({
          sid: UUID_MATCHER,
          did: 'some_user',
          init: true,
          started: ISO_DATE_MATCHER,
          timestamp: ISO_DATE_MATCHER,
          status: 'ok',
          errors: 0,
          duration: expect.any(Number),
          attrs: expect.objectContaining({
            environment: 'development',
            release: 'session-abnormal-exit-electron-uploader@1.0.0',
          }),
        }),
      })
      .expect({
        envelope: (envelope: Envelope) => {
          const session = getSessionFromEnvelope(envelope);
          expect(session?.sid).toEqual(firstSessionId);

          expect(
            sessionEnvelope({
              sid: UUID_MATCHER,
              did: 'some_user',
              init: false,
              started: ISO_DATE_MATCHER,
              timestamp: ISO_DATE_MATCHER,
              status: 'abnormal',
              errors: 1,
              duration: expect.any(Number),
              attrs: expect.objectContaining({
                environment: 'development',
                release: 'session-abnormal-exit-electron-uploader@1.0.0',
              }),
            }),
          ).toEqual(envelope);
        },
      })
      .run();
  },
);
