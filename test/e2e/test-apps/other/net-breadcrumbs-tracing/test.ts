import { expect } from 'vitest';

import { electronTestRunner, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: transactionEnvelope({
        type: 'transaction',
        platform: 'node',
        transaction: 'some-transaction',
        tags: {
          'event.environment': 'javascript',
          'event.origin': 'electron',
          'event.process': 'browser',
        },
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
        },
        spans: expect.arrayContaining([
          expect.objectContaining({
            op: 'http.client',
            trace_id: UUID_MATCHER,
            origin: 'auto.http.electron.net',
            parent_span_id: SHORT_UUID_MATCHER,
            span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            description: 'GET http://localhost:8123/something',
            data: expect.objectContaining({
              'http.method': 'GET',
              'http.response.status_code': expect.any(Number),
              'sentry.op': 'http.client',
              'sentry.origin': 'auto.http.electron.net',
              url: 'http://localhost:8123/something',
              type: 'net.request',
            }),
          }),
        ]),
        transaction_info: {
          source: 'custom',
        },
      }),
    })
    .run();
});
