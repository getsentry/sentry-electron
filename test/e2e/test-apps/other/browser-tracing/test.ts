import { expect } from 'vitest';

import { electronTestRunner, SHORT_UUID_MATCHER, transactionEnvelope, UUID_MATCHER } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser Tracing fails on Electron v24
    skip: (electronVersion) => electronVersion.major === 24,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: transactionEnvelope({
          platform: 'javascript',
          type: 'transaction',
          release: 'some-release',
          transaction: 'app:///src/index.html',
          start_timestamp: expect.any(Number),
          transaction_info: {
            source: 'custom',
          },
          contexts: {
            trace: expect.objectContaining({
              trace_id: UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              data: expect.objectContaining({
                'sentry.origin': 'auto.pageload.browser',
                'sentry.sample_rate': 1,
                'sentry.source': 'url',
              }),
              op: 'pageload',
              origin: 'auto.pageload.browser',
            }),
          },
          spans: expect.arrayContaining([
            {
              data: {
                'sentry.op': 'browser.connect',
                'sentry.origin': 'auto.ui.browser.metrics',
              },
              description: expect.any(String),
              op: 'browser.connect',
              origin: 'auto.ui.browser.metrics',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
            },
            {
              data: {
                'sentry.op': 'browser.cache',
                'sentry.origin': 'auto.ui.browser.metrics',
              },
              description: expect.any(String),
              op: 'browser.cache',
              origin: 'auto.ui.browser.metrics',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
            },
            {
              data: {
                'sentry.op': 'browser.DNS',
                'sentry.origin': 'auto.ui.browser.metrics',
              },
              description: expect.any(String),
              op: 'browser.DNS',
              origin: 'auto.ui.browser.metrics',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
            },
            {
              data: {
                'sentry.op': 'browser.request',
                'sentry.origin': 'auto.ui.browser.metrics',
              },
              description: expect.any(String),
              op: 'browser.request',
              origin: 'auto.ui.browser.metrics',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
            },
            {
              data: {
                'sentry.op': 'browser.response',
                'sentry.origin': 'auto.ui.browser.metrics',
              },
              description: expect.any(String),
              op: 'browser.response',
              origin: 'auto.ui.browser.metrics',
              parent_span_id: SHORT_UUID_MATCHER,
              span_id: SHORT_UUID_MATCHER,
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
              trace_id: UUID_MATCHER,
            },
          ]),
          measurements: {
            'connection.rtt': {
              unit: 'millisecond',
              value: expect.any(Number),
            },
            ttfb: {
              unit: 'millisecond',
              value: expect.any(Number),
            },
            'ttfb.requestTime': {
              unit: 'millisecond',
              value: expect.any(Number),
            },
          },
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
      .run();
  },
);
