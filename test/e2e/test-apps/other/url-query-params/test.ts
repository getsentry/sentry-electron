import { expect } from 'vitest';
import { electronTestRunner, getEventFromEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: (env) => {
        const event = getEventFromEnvelope(env);
        const breadcrumbs = event?.breadcrumbs || [];

        const net = breadcrumbs.find((b) => b.category === 'electron.net');
        expect(net?.data?.url).toBe('http://localhost:8123/something');

        const domReady = breadcrumbs.find((b) => b.message?.endsWith('.dom-ready'));
        expect(domReady?.data?.url).toBe('app:///src/index.html');

        for (const breadcrumb of breadcrumbs) {
          expect(breadcrumb.data?.url ?? '').not.toMatch(/[?#]/);
        }
      },
    })
    .run();
});
