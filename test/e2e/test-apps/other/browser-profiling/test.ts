import { expect } from 'vitest';
import { electronTestRunner, ISO_DATE_MATCHER, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: transactionEnvelope(
        {
          platform: 'javascript',
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
            },
          ]),
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'renderer',
          },
          request: {
            headers: {},
            url: 'app:///src/index.html',
          },
        },
        [
          { type: 'profile' },
          {
            event_id: UUID_MATCHER,
            timestamp: ISO_DATE_MATCHER,
            platform: 'javascript',
            version: '1',
            release: 'some-release',
            environment: 'development',
            runtime: expect.any(Object),
            os: expect.any(Object),
            device: expect.any(Object),
            debug_meta: expect.any(Object),
            profile: expect.objectContaining({
              samples: expect.arrayContaining([
                {
                  elapsed_since_start_ns: expect.any(String),
                  stack_id: expect.any(Number),
                  thread_id: expect.any(String),
                },
                {
                  elapsed_since_start_ns: expect.any(String),
                  stack_id: expect.any(Number),
                  thread_id: expect.any(String),
                },
                {
                  elapsed_since_start_ns: expect.any(String),
                  stack_id: expect.any(Number),
                  thread_id: expect.any(String),
                },
                {
                  elapsed_since_start_ns: expect.any(String),
                  stack_id: expect.any(Number),
                  thread_id: expect.any(String),
                },
              ]),
              stacks: expect.any(Array),
              frames: expect.arrayContaining([
                {
                  function: expect.any(String),
                  abs_path: 'app:///src/index.html',
                  lineno: expect.any(Number),
                  colno: expect.any(Number),
                },
              ]),
              thread_metadata: expect.any(Object),
            }),
            transactions: expect.arrayContaining([
              {
                name: 'Long work',
                id: UUID_MATCHER,
                trace_id: UUID_MATCHER,
                active_thread_id: expect.any(String),
                relative_start_ns: expect.any(String),
                relative_end_ns: expect.any(String),
              },
            ]),
          },
        ],
      ),
    })
    .run();
});
