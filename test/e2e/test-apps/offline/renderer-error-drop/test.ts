import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, { runTwice: true, timeout: 25_000, waitAfterExpectedEvents: 8_000 }, async (ctx) => {
  await ctx.run();
});
