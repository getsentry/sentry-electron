import { expect } from 'vitest';

import { electronTestRunner } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      minidump: {
        // Renderer crashes do not have any event data
        event: {},
        dumpFile: expect.any(Buffer),
        namespacedData: {
          initialScope: {
            environment: 'development',
            release: 'native-electron-renderer@1.0.0',
            user: {
              username: 'some_user',
            },
          },
        },
      },
    })
    .run();
});
