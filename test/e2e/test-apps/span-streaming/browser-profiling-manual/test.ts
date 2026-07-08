import type { StreamedSpanJSON } from '@sentry/core';
import { expect } from 'vitest';
import { electronTestRunner, profileChunkEnvelope, SHORT_UUID_MATCHER, spanEnvelope, UUID_MATCHER } from '../../..';

// A child span for each `startSpan({ name: 'PBKDF2' })` call in the renderer
function pbkdf2Span(): StreamedSpanJSON {
  return {
    name: 'PBKDF2',
    span_id: SHORT_UUID_MATCHER,
    trace_id: UUID_MATCHER,
    parent_span_id: SHORT_UUID_MATCHER,
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.origin': { value: 'manual', type: 'string' },
      'sentry.environment': { value: 'production', type: 'string' },
      'sentry.segment.name': { value: 'Long work', type: 'string' },
      'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
    }),
  };
}

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .ignoreExpectationOrder()
    // The transaction is streamed as a span envelope. UI profiling attaches the
    // profiler id to the segment span rather than a profile context.
    .expect({
      envelope: spanEnvelope(
        'Long work',
        [
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          pbkdf2Span(),
          {
            name: 'Long work',
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
            is_segment: true,
            status: 'ok',
            attributes: expect.objectContaining({
              'sentry.origin': { value: 'manual', type: 'string' },
              'sentry.source': { value: 'custom', type: 'string' },
              'sentry.sample_rate': { value: 1, type: 'integer' },
              'sentry.environment': { value: 'production', type: 'string' },
              'sentry.segment.name': { value: 'Long work', type: 'string' },
              'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
              'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
              'sentry.profiler_id': { value: UUID_MATCHER, type: 'string' },
              'sentry.span.source': { value: 'custom', type: 'string' },
            }),
          },
        ],
        { ingest_settings: { infer_ip: 'never', infer_user_agent: 'never' } },
      ),
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
