import { Envelope } from '@sentry/core';
import { expect } from 'vitest';

import {
  electronTestRunner,
  expectedEvent,
  getSessionFromEnvelope,
  ISO_DATE_MATCHER,
  SDK_VERSION,
  sessionEnvelope,
  UUID_MATCHER,
} from '../../..';

electronTestRunner(__dirname, { runTwice: true, timeout: 50_000 }, async (ctx) => {
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
          }),
        ).toEqual(envelope);
      },
    })
    .expect({
      minidump: {
        event: expectedEvent({
          // Timestamp is not available via the minidump endpoint
          timestamp: undefined,
          // Trace context is not available via the minidump endpoint
          contexts: {
            trace: undefined,
          },
          // Integrations are not included via the minidump endpoint
          sdk: {
            name: 'sentry.javascript.electron',
            packages: [
              {
                name: 'npm:@sentry/electron',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
          level: 'fatal',
          platform: 'native',
          tags: {
            'event.origin': 'electron',
            'event.environment': 'native',
            'event.process': 'browser',
          },
          user: { username: 'some_user' },
        }),
        dumpFile: expect.any(Buffer),
        namespacedData: {
          initialScope: {
            environment: 'development',
            release: 'session-native-crash-main-electron-uploader@1.0.0',
            user: {
              username: 'some_user',
            },
          },
        },
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
            status: 'crashed',
            errors: 1,
            duration: expect.any(Number),
          }),
        ).toEqual(envelope);
      },
    })
    .run();
});
