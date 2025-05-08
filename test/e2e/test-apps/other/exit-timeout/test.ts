import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.expectErrorOutputToContain('Some console output').run();
});
