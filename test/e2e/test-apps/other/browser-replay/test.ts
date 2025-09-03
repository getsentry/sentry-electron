import { SDK_VERSION as JS_SDK_VERSION } from '@sentry/core';
import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope, ISO_DATE_MATCHER, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'javascript',
        environment: 'custom-env',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some renderer error',
              stacktrace: {
                frames: expect.arrayContaining([
                  {
                    colno: expect.any(Number),
                    filename: 'app:///src/index.html',
                    function: '?',
                    in_app: true,
                    lineno: expect.any(Number),
                  },
                ]),
              },
              mechanism: {
                handled: false,
                type: 'instrument',
                data: {
                  function: 'setTimeout',
                },
              },
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'renderer',
          replayId: UUID_MATCHER,
        },
        request: {
          headers: {},
          url: 'app:///src/index.html',
        },
        extra: {
          arguments: [],
        },
      }),
    })
    .expect({
      envelope: [
        {
          event_id: UUID_MATCHER,
          sent_at: ISO_DATE_MATCHER,
          sdk: { name: 'sentry.javascript.browser', version: JS_SDK_VERSION },
        },
        [
          [
            { type: 'replay_event' },
            {
              type: 'replay_event',
              replay_start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              error_ids: [UUID_MATCHER],
              trace_ids: expect.any(Array),
              urls: ['app:///src/index.html'],
              replay_id: UUID_MATCHER,
              segment_id: expect.any(Number),
              replay_type: 'buffer',
              request: {
                url: 'app:///src/index.html',
                headers: expect.any(Object),
              },
              event_id: UUID_MATCHER,
              environment: 'custom-env',
              sdk: {
                integrations: expect.any(Array),
                name: 'sentry.javascript.browser',
                version: JS_SDK_VERSION,
                settings: { infer_ip: 'never' },
              },
              platform: 'javascript',
              breadcrumbs: expect.any(Array),
              tags: expect.any(Object),
              user: expect.any(Object),
            },
          ],
          [
            {
              type: 'replay_recording',
              length: expect.any(Number),
            },
            expect.any(Buffer),
          ],
        ],
      ],
    })
    .run();
});
