import { electronTestRunner } from '../../../runner';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.run();
});
