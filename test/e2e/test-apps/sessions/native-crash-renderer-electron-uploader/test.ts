import { expect } from 'vitest';

import { electronTestRunner, getSessionFromEnvelope, ISO_DATE_MATCHER, sessionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, { runTwice: true, timeout: 25_000 }, async (ctx) => {
  let firstSessionId: string | undefined;

  const session1 = {
    envelope: (envelope) => {
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
  };

  const event = {
    minidump: {
      event: {},
      dumpFile: expect.any(Buffer),
      namespacedData: {
        initialScope: {
          environment: 'development',
          release: 'session-native-crash-renderer-electron-uploader@1.0.0',
          user: {
            username: 'some_user',
          },
        },
      },
    },
  };

  const session2 = {
    envelope: (envelope) => {
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
  };

  // On linux the envelopes arrive in a different order
  if (process.platform === 'linux') {
    ctx.includeSessionEnvelopes().expect(session1).expect(event).expect(session2).run();
  } else {
    ctx.includeSessionEnvelopes().expect(session1).expect(session2).expect(event).run();
  }
});
