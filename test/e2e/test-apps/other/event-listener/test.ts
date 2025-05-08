import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, { skip: (electronVersion) => electronVersion.major < 33 }, async (ctx) => {
  await ctx.expectErrorOutputToContain('Listener count = 3').run();
});
