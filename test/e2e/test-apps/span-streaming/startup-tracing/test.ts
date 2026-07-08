import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser tracing spans differ on < v25
    skip: (electronVersion) => electronVersion.major < 25,
  },
  async (ctx) => {
    await ctx
      .expect({
        // In stream mode the renderer's pageload spans are streamed to the main process and
        // merged into the single `Startup` segment (as in non-stream mode). The exact set of
        // `browser.*`/`ui.long-task` spans varies between Electron/Chromium versions, so we
        // assert the segment and the presence of the key main + renderer spans.
        envelope: (envelope) => {
          const [header] = envelope;
          expect(header.sdk).toEqual({ name: 'sentry.javascript.electron', version: expect.any(String) });

          const spans = getSpansFromEnvelope(envelope);
          expect(spans).toBeDefined();

          // The segment is the main process `Startup` span
          const segment = spans?.find((s) => s.is_segment);
          expect(segment).toMatchObject({
            name: 'Startup',
            is_segment: true,
            status: 'ok',
            attributes: expect.objectContaining({
              'sentry.op': { value: 'app.start', type: 'string' },
              'sentry.origin': { value: 'auto.electron.startup', type: 'string' },
              'sentry.release': { value: 'startup-tracing@1.0.0', type: 'string' },
              'sentry.sample_rate': { value: 1, type: 'integer' },
            }),
          });

          // Everything is merged into the one startup trace/segment
          for (const span of spans ?? []) {
            expect(span.trace_id).toEqual(segment?.trace_id);
            expect(span.attributes?.['sentry.segment.name']).toEqual({ value: 'Startup', type: 'string' });
          }

          // The main startup spans, the renderer wrapper span and the key browser metric spans
          // are all present as children of the startup segment
          const ops = (spans ?? []).map(
            (s) => (s.attributes as Record<string, { value?: unknown }> | undefined)?.['sentry.op']?.value,
          );
          for (const op of [
            'electron.will-finish-launching',
            'electron.ready',
            'electron.web-contents.created',
            'electron.web-contents.dom-ready',
            'electron.renderer',
            'browser.connect',
            'browser.request',
            'browser.response',
          ]) {
            expect(ops).toContain(op);
          }
        },
      })
      .run();
  },
);
