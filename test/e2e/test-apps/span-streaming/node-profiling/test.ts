import type { StreamedSpanJSON } from '@sentry/core';
import { expect } from 'vitest';
import { electronTestRunner, profileChunkEnvelope, SHORT_UUID_MATCHER, spanEnvelope, UUID_MATCHER } from '../../..';

// A child span for each `startSpan({ name: 'PBKDF2' })` call in the main process
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
      'sentry.release': { value: 'some-release', type: 'string' },
      'sentry.environment': { value: 'development', type: 'string' },
      'sentry.segment.name': { value: 'Long work', type: 'string' },
      'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
      'sentry.source': { value: 'custom', type: 'string' },
      'sentry.span.source': { value: 'custom', type: 'string' },
    }),
  };
}

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .ignoreExpectationOrder()
    // The transaction is streamed as a span envelope. In trace mode the profiler
    // automatically starts/stops with the span and attaches its id to the segment.
    .expect({
      envelope: spanEnvelope('Long work', [
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
            'sentry.sample_rate': { value: 1, type: 'integer' },
            'sentry.release': { value: 'some-release', type: 'string' },
            'sentry.environment': { value: 'development', type: 'string' },
            'sentry.segment.name': { value: 'Long work', type: 'string' },
            'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
            'sentry.source': { value: 'custom', type: 'string' },
            'sentry.profiler_id': { value: UUID_MATCHER, type: 'string' },
            'sentry.span.source': { value: 'custom', type: 'string' },
          }),
        },
      ]),
    })
    // Expect the profile_chunk envelope from continuous node profiling
    .expect({
      envelope: profileChunkEnvelope(
        {
          release: 'some-release',
          environment: 'development',
          measurements: expect.any(Object),
        },
        'node',
      ),
    })
    .run();
});
