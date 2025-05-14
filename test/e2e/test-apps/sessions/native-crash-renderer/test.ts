import { expect } from 'vitest';
import {
  electronTestRunner,
  eventEnvelope,
  getSessionFromEnvelope,
  ISO_DATE_MATCHER,
  sessionEnvelope,
  UUID_MATCHER,
} from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  let firstSessionId: string | undefined;

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
            status: 'crashed',
            errors: 1,
            duration: expect.any(Number),
          }),
        ).toEqual(envelope);
      },
    })
    .expect({
      envelope: eventEnvelope(
        {
          level: 'fatal',
          platform: 'native',
          tags: {
            'event.environment': 'native',
            'event.origin': 'electron',
            'event.process': 'renderer',
            'exit.reason': 'crashed',
          },
        },
        [
          {
            type: 'attachment',
            length: expect.any(Number),
            filename: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.dmp$/),
            attachment_type: 'event.minidump',
          },
          expect.any(Buffer),
        ],
      ),
    })
    .run();
});
