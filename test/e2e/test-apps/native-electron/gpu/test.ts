import { expect } from 'vitest';

import { electronTestRunner } from '../../..';

electronTestRunner(
  __dirname,
  {
    // The GPU process is not reliable on Linux in GHA
    skip: () => process.platform === 'linux',
  },
  async (ctx) => {
    await ctx
      .expect({
        minidump: {
          // GPU crashes do not have any event data
          event: {},
          dumpFile: expect.any(Buffer),
          namespacedData: {
            initialScope: {
              environment: 'development',
              release: 'native-electron-gpu@1.0.0',
              user: {
                username: 'some_user',
              },
            },
          },
        },
      })
      .run();
  },
);
