import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.run();
});
