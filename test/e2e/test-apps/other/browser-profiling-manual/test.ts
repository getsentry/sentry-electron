import { expect } from 'vitest';
import {
  electronTestRunner,
  profileChunkEnvelope,
  SHORT_UUID_MATCHER,
  transactionEnvelope,
  UUID_MATCHER,
} from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    // Expect the transaction (without attached profile since we're using UI profiling)
    .expect({
      envelope: transactionEnvelope({
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
            data: expect.objectContaining({
              'sentry.origin': 'manual',
              'sentry.sample_rate': 1,
              'sentry.source': 'custom',
            }),
            origin: 'manual',
          }),
          // UI profiling adds profile context with profiler_id
          profile: {
            profiler_id: UUID_MATCHER,
          },
        },
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'PBKDF2',
            origin: 'manual',
            parent_span_id: SHORT_UUID_MATCHER,
            span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            trace_id: UUID_MATCHER,
          }),
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
      }),
    })
    // Expect the profile_chunk envelope from UI profiling
    .expect({
      envelope: profileChunkEnvelope({
        release: 'some-release',
        environment: 'development',
        profile: expect.objectContaining({
          samples: expect.arrayContaining([
            expect.objectContaining({
              stack_id: expect.any(Number),
              thread_id: expect.any(String),
              timestamp: expect.any(Number),
            }),
          ]),
          stacks: expect.any(Array),
          frames: expect.arrayContaining([
            expect.objectContaining({
              function: expect.any(String),
              abs_path: expect.stringContaining('app:///'),
            }),
          ]),
          thread_metadata: expect.any(Object),
        }),
      }),
    })
    .run();
});
