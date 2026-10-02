import { expect } from 'vitest';
import { electronTestRunner, getEventFromEnvelope, getSpansFromEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .ignoreExpectationOrder()
    .expect({
      envelope: (env) => {
        const event = getEventFromEnvelope(env);
        expect(event).toBeDefined();
        expect(event?.user?.ip_address).toBeUndefined();
        expect(event?.sdk?.settings).toEqual({ infer_ip: 'never' });
      },
    })
    // Spans streamed from the renderer use the main process setting
    .expect({
      envelope: (env) => {
        expect(getSpansFromEnvelope(env)).toBeDefined();
        const container = env[1][0]?.[1] as { ingest_settings?: { infer_ip?: string } };
        expect(container.ingest_settings?.infer_ip).toEqual('never');
      },
    })
    .run();
});
