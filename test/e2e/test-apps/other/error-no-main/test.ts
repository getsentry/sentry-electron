import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx.expectErrorOutputToContain('failed to establish connection with the Electron main process').run();
});
