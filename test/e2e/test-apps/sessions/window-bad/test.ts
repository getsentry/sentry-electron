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
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some renderer error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    filename: 'app:///src/index.html',
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                    in_app: true,
                  },
                ]),
              },
              mechanism: {
                type: 'auto.browser.browserapierrors.setTimeout',
                handled: false,
              },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
        },
        extra: {
          arguments: [],
        },
        request: {
          headers: {},
          url: 'app:///src/index.html',
        },
      }),
    })
    .run();
});
