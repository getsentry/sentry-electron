import { expect } from 'vitest';
import { electronTestRunner, spanEnvelope, SHORT_UUID_MATCHER, UUID_MATCHER } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser Tracing fails on Electron v24
    skip: (electronVersion) => electronVersion.major === 24,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: spanEnvelope('InitSequence', [
          {
            name: 'initializeServices',
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
            is_segment: false,
            status: 'ok',
            attributes: expect.objectContaining({
              'sentry.environment': { value: 'development', type: 'string' },
              'sentry.segment.name': { value: 'InitSequence', type: 'string' },
              'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
              'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
              'sentry.source': { value: 'custom', type: 'string' },
              'sentry.span.source': { value: 'custom', type: 'string' },
            }),
          },
          {
            name: 'InitSequence',
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
            is_segment: true,
            status: 'ok',
            attributes: expect.objectContaining({
              'sentry.op': { value: 'task', type: 'string' },
              'sentry.sample_rate': { value: 1, type: 'integer' },
              'sentry.environment': { value: 'development', type: 'string' },
              'sentry.segment.name': { value: 'InitSequence', type: 'string' },
              'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
              'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
              'sentry.source': { value: 'custom', type: 'string' },
              'sentry.sdk.integrations': { value: expect.any(Array), type: 'array' },
              'os.name': { value: expect.any(String), type: 'string' },
              'sentry.span.source': { value: 'custom', type: 'string' },
            }),
          },
        ]),
      })
      .run();
  },
);
