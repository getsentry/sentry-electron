import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.expectErrorOutputToContain("should be initialized before the Electron app 'ready'").run();
});
