import { expect } from 'vitest';

import { electronTestRunner, getEventFromEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: (env) => {
        const event = getEventFromEnvelope(env);
        expect(event).toBeDefined();
        expect(event?.breadcrumbs?.length).to.be.greaterThan(5);

        let withData = 0;

        for (const breadcrumb of event?.breadcrumbs || []) {
          if (breadcrumb?.data?.id) {
            withData += 1;
          }

          expect(breadcrumb?.data?.title).to.be.undefined;
        }

        expect(withData).to.be.greaterThanOrEqual(2);
      },
    })
    .run();
});
