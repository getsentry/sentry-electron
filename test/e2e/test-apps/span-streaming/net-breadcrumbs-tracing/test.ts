import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope, SHORT_UUID_MATCHER, spanEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expectErrorOutputToContain('Adding traceparent header')
    .expect({
      envelope: eventEnvelope({
        level: 'error',
        platform: 'node',
        exception: {
          values: [
            {
              type: 'FetchError',
              value: 'request to http://localhost:8123/something failed, reason: net::ERR_CONNECTION_REFUSED',
              mechanism: expect.any(Object),
              stacktrace: expect.any(Object),
            },
          ],
        },
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
      }),
    })
    .expect({
      envelope: spanEnvelope('some-transaction', [
        {
          name: 'GET http://localhost:8123/something',
          span_id: SHORT_UUID_MATCHER,
          trace_id: UUID_MATCHER,
          parent_span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          is_segment: false,
          status: 'error',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'http.client', type: 'string' },
            url: {
              value: 'http://localhost:8123/something',
              type: 'string',
            },
            type: { value: 'net.request', type: 'string' },
            'http.method': { value: 'GET', type: 'string' },
            'sentry.origin': { value: 'auto.http.electron.net', type: 'string' },
            'http.response.status_code': { value: 500, type: 'integer' },
            'sentry.release': {
              value: 'net-breadcrumbs-tracing@1.0.0',
              type: 'string',
            },
            'sentry.environment': { value: 'development', type: 'string' },
            'sentry.segment.name': { value: 'some-transaction', type: 'string' },
            'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
            'sentry.source': { value: 'custom', type: 'string' },
            'sentry.span.source': { value: 'custom', type: 'string' },
          }),
        },
        {
          name: 'some-transaction',
          span_id: SHORT_UUID_MATCHER,
          trace_id: UUID_MATCHER,
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          is_segment: true,
          status: 'error',
          attributes: expect.objectContaining({
            'sentry.sample_rate': { value: 1, type: 'integer' },
            'sentry.release': {
              value: 'net-breadcrumbs-tracing@1.0.0',
              type: 'string',
            },
            'sentry.environment': { value: 'development', type: 'string' },
            'sentry.segment.name': { value: 'some-transaction', type: 'string' },
            'sentry.segment.id': { value: SHORT_UUID_MATCHER, type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
            'sentry.source': { value: 'custom', type: 'string' },
            'sentry.sdk.integrations': { value: expect.any(Array), type: 'array' },
            'process.runtime.engine.name': { value: 'v8', type: 'string' },
            'os.name': { value: expect.any(String), type: 'string' },
            'sentry.span.source': { value: 'custom', type: 'string' },
          }),
        },
      ]),
    })
    .run();
});
