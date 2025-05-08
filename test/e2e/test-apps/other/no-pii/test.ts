import { expect } from 'vitest';
import { electronTestRunner, getEventFromEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: (env) => {
        const event = getEventFromEnvelope(env);
        expect(event).toBeDefined();
        expect(event?.user?.ip_address).toBeUndefined();
      },
    })
    .run();
});
