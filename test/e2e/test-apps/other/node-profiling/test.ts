import { expect } from 'vitest';
import { electronTestRunner, ISO_DATE_MATCHER, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: transactionEnvelope(
        {
          platform: 'node',
          type: 'transaction',
          release: 'some-release',
          transaction: 'Long work',
          transaction_info: { source: 'custom' },
          start_timestamp: expect.any(Number),
          contexts: {
            trace: expect.objectContaining({
              trace_id: UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              data: {
                'sentry.origin': 'manual',
                'sentry.sample_rate': 1,
                'sentry.source': 'custom',
              },
              origin: 'manual',
            }),
          },
          spans: expect.arrayContaining([
            {
              data: {
                'sentry.origin': 'manual',
              },
              description: 'PBKDF2',
              origin: 'manual',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
              status: 'ok',
            },
            {
              data: {
                'sentry.origin': 'manual',
              },
              description: 'PBKDF2',
              origin: 'manual',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
              status: 'ok',
            },
            {
              data: {
                'sentry.origin': 'manual',
              },
              description: 'PBKDF2',
              origin: 'manual',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
              status: 'ok',
            },
            {
              data: {
                'sentry.origin': 'manual',
              },
              description: 'PBKDF2',
              origin: 'manual',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
              status: 'ok',
            },
          ]),
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'browser',
          },
        },
        [
          { type: 'profile' },
          {
            event_id: UUID_MATCHER,
            timestamp: ISO_DATE_MATCHER,
            platform: 'node',
            version: '1',
            release: 'some-release',
            environment: 'development',
            measurements: {
              cpu_usage: expect.any(Object),
              memory_footprint: expect.any(Object),
            },
            runtime: expect.any(Object),
            os: expect.any(Object),
            device: expect.any(Object),
            debug_meta: expect.any(Object),
            profile: expect.objectContaining({
              samples: expect.any(Array),
              stacks: expect.any(Array),
              frames: expect.any(Array),
              thread_metadata: expect.any(Object),
            }),
            transaction: expect.objectContaining({
              name: 'Long work',
              id: UUID_MATCHER,
              trace_id: UUID_MATCHER,
              active_thread_id: expect.any(String),
            }),
          },
        ],
      ),
    })
    .run();
});
