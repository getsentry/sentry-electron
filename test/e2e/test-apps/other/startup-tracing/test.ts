import { expect } from 'vitest';
import { electronTestRunner, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: transactionEnvelope({
        type: 'transaction',
        platform: 'node',
        transaction: 'electron.startup',
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
              'sentry.source': 'url',
              'sentry.sample_rate': 1,
              'sentry.op': 'electron.startup',
              'sentry.origin': 'auto.electron.startup',
              'performance.timeOrigin': expect.any(Number),
              effectiveConnectionType: expect.any(String),
              deviceMemory: expect.any(String),
              hardwareConcurrency: expect.any(String),
              'performance.activationStart': 0,
              'sentry.idle_span_finish_reason': 'idleTimeout'
            }),
            op: 'electron.startup',
            origin: 'auto.electron.startup',
          }),
        },
        measurements: {
          ttfb: { value: expect.any(Number), unit: 'millisecond' },
          'connection.rtt': { value: expect.any(Number), unit: 'millisecond' },
          'ttfb.requestTime': { value: expect.any(Number), unit: 'millisecond' }
        },
        spans: expect.arrayContaining([
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'will-finish-launching',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'electron.will-finish-launching',
            origin: 'auto.electron.startup',
          },
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'web-contents-created',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'electron.web-contents.created',
            origin: 'auto.electron.startup',
          },
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'ready',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'electron.ready',
            origin: 'auto.electron.startup',
          },
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'dom-ready',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'electron.web-contents.dom-ready',
            origin: 'auto.electron.startup',
          },
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'app:///src/index.html',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'browser.response',
            origin: 'auto.ui.browser.metrics'
          },
          {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            data: expect.any(Object),
            description: 'app:///src/index.html',
            parent_span_id: SHORT_UUID_MATCHER,
            start_timestamp: expect.any(Number),
            timestamp: expect.any(Number),
            status: 'ok',
            op: 'browser.connect',
            origin: 'auto.ui.browser.metrics'
          },
        ]),
        transaction_info: expect.any(Object),
        start_timestamp: expect.any(Number),
      }),
    })
    .run();
});
