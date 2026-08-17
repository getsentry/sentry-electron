import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser Tracing fails on Electron v24
    skip: (electronVersion) => electronVersion.major === 24,
  },
  async (ctx) => {
    await ctx
      .expect({
        // The browser pageload transaction is streamed as a span envelope. The exact
        // set of `browser.*` performance metric spans varies between Electron/Chromium
        // versions, so we assert the pageload segment and the presence of the key
        // metric spans rather than an exact list.
        envelope: (envelope) => {
          const [header] = envelope;
          expect(header.sdk).toEqual({ name: 'sentry.javascript.electron', version: expect.any(String) });

          const spans = getSpansFromEnvelope(envelope);
          expect(spans).toBeDefined();

          // The segment is the browser pageload span
          const segment = spans?.find((s) => s.is_segment);
          expect(segment).toMatchObject({
            name: 'app:///src/index.html',
            is_segment: true,
            status: 'ok',
            attributes: expect.objectContaining({
              'sentry.op': { value: 'pageload', type: 'string' },
              'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
              'sentry.source': { value: 'url', type: 'string' },
              'sentry.sample_rate': { value: 1, type: 'integer' },
            }),
          });

          // All spans share the same trace
          for (const span of spans ?? []) {
            expect(span.trace_id).toEqual(segment?.trace_id);
          }

          // The key browser performance metric spans are present as children
          const ops = (spans ?? []).map(
            (s) => (s.attributes as Record<string, { value?: unknown }> | undefined)?.['sentry.op']?.value,
          );
          for (const op of ['browser.connect', 'browser.cache', 'browser.DNS', 'browser.request', 'browser.response']) {
            expect(ops).toContain(op);
          }
        },
      })
      .run();
  },
);
