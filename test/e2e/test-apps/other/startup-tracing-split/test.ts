import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Browser tracing spans differ on < v25
    skip: (electronVersion) => electronVersion.major < 25,
    timeout: 40_000,
  },
  async (ctx) => {
    let startupTraceId: string | undefined;

    await ctx
      .expect({
        // The main process startup child spans get flushed before the startup segment ends
        envelope: (envelope) => {
          const spans = getSpansFromEnvelope(envelope);
          expect(spans).toBeDefined();
          expect(spans?.find((s) => s.is_segment)).toBeUndefined();

          const ops = (spans ?? []).map(
            (s) => (s.attributes as Record<string, { value?: unknown }> | undefined)?.['sentry.op']?.value,
          );
          for (const op of [
            'electron.will-finish-launching',
            'electron.ready',
            'electron.web-contents.created',
            'electron.web-contents.dom-ready',
          ]) {
            expect(ops).toContain(op);
          }

          startupTraceId = spans?.[0]?.trace_id;
          for (const span of spans ?? []) {
            expect(span.trace_id).toEqual(startupTraceId);
            expect(span.attributes?.['sentry.segment.name']).toEqual({ value: 'Startup', type: 'string' });
          }
        },
      })
      .expect({
        // The renderer keeps the pageload span open past the streaming flush interval so the
        // pageload span tree arrives in the main process over multiple envelopes. All pageload
        // spans should still end up merged into the single startup trace, including spans that
        // arrived in envelopes flushed before the pageload segment ended.
        envelope: (envelope) => {
          const [header] = envelope;
          expect(header.sdk).toEqual({ name: 'sentry.javascript.electron', version: expect.any(String) });

          const spans = getSpansFromEnvelope(envelope);
          expect(spans).toBeDefined();

          const segment = spans?.find((s) => s.is_segment);
          expect(segment).toMatchObject({
            name: 'Startup',
            is_segment: true,
            status: 'ok',
          });

          // Same trace as the startup child spans from the earlier envelope
          expect(segment?.trace_id).toEqual(startupTraceId);

          // 'early-child' was streamed to the main process in an envelope flushed before the
          // pageload segment ended and would otherwise be orphaned in a trace that never gets
          // sent
          const names = (spans ?? []).map((s) => s.name);
          expect(names).toContain('early-child');
          expect(names).toContain('late-child');

          // The renderer wrapper span is present
          const ops = (spans ?? []).map(
            (s) => (s.attributes as Record<string, { value?: unknown }> | undefined)?.['sentry.op']?.value,
          );
          expect(ops).toContain('electron.renderer');

          for (const span of spans ?? []) {
            expect(span.trace_id).toEqual(segment?.trace_id);
          }
        },
      })
      .run();
  },
);
