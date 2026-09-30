import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: (envelope) => {
        const spans = getSpansFromEnvelope(envelope);
        expect(spans).toBeDefined();

        const root = spans?.find((span) => span.name === 'otel-root');
        const child = spans?.find((span) => span.name === 'otel-child');

        expect(root?.is_segment).toBe(true);
        expect(child).toBeDefined();
        expect(child?.parent_span_id).toBe(root?.span_id);
        expect(child?.trace_id).toBe(root?.trace_id);
      },
    })
    .run();
});
