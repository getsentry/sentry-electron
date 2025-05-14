import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.expectErrorOutputToContain('Initializing Sentry: process').run();
});
