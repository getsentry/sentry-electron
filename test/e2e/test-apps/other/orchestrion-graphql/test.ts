import { expect } from 'vitest';
import { electronTestRunner, getSpansFromEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Keep the app as CommonJS so it can `require('graphql')` lazily, after `Sentry.init`
    // has registered the orchestrion loader hook (the auto CJS->ESM transform would hoist
    // the import above init).
    skipEsmAutoTransform: true,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: (envelope) => {
          const spans = getSpansFromEnvelope(envelope);
          expect(spans).toBeDefined();

          // The manually started segment span
          expect(spans?.some((span) => span.is_segment && span.name === 'orchestrion-graphql')).toBe(true);

          // The executed graphql query span, injected by orchestrion's diagnostics-channel
          // instrumentation. The `auto.graphql.diagnostic_channel` origin is what proves the
          // loader hook actually injected the instrumentation into the `graphql` module.
          const executeSpan = spans?.find((span) => span.attributes?.['graphql.processing.type']?.value === 'execute');
          expect(executeSpan).toBeDefined();
          expect(executeSpan?.name).toBe('GraphQL query');
          expect(executeSpan?.attributes?.['sentry.origin']).toEqual({
            value: 'auto.graphql.diagnostic_channel',
            type: 'string',
          });
          expect(executeSpan?.attributes?.['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
          expect(executeSpan?.attributes?.['graphql.document']).toEqual({ value: '{ hello }', type: 'string' });
          expect(executeSpan?.attributes?.['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
        },
      })
      .run();
  },
);
