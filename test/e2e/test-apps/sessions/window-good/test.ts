import { expect } from 'vitest';

import { electronTestRunner, getSessionFromEnvelope, ISO_DATE_MATCHER, sessionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  let firstSessionId: string | undefined;
  let secondSessionId: string | undefined;

  await ctx
    .includeSessionEnvelopes()
    .expect({
      envelope: (envelope) => {
        const session = getSessionFromEnvelope(envelope);
        firstSessionId = session?.sid;
        expect(firstSessionId).toBeDefined();

        expect(
          sessionEnvelope({
            sid: UUID_MATCHER,
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
      envelope: (envelope) => {
        const session = getSessionFromEnvelope(envelope);
        expect(session?.sid).toEqual(firstSessionId);

        expect(
          sessionEnvelope({
            sid: UUID_MATCHER,
            init: false,
            started: ISO_DATE_MATCHER,
            timestamp: ISO_DATE_MATCHER,
            status: 'exited',
            errors: 0,
            duration: expect.any(Number),
          }),
        ).toEqual(envelope);
      },
    })
    .expect({
      envelope: (envelope) => {
        const session = getSessionFromEnvelope(envelope);
        secondSessionId = session?.sid;
        expect(secondSessionId).toBeDefined();

        expect(
          sessionEnvelope({
            sid: UUID_MATCHER,
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
      envelope: (envelope) => {
        const session = getSessionFromEnvelope(envelope);
        expect(session?.sid).toEqual(secondSessionId);

        expect(
          sessionEnvelope({
            sid: UUID_MATCHER,
            init: false,
            started: ISO_DATE_MATCHER,
            timestamp: ISO_DATE_MATCHER,
            status: 'exited',
            errors: 0,
            duration: expect.any(Number),
          }),
        ).toEqual(envelope);
      },
    })
    .run();
});
