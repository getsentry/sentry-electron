import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../test/e2e';

electronTestRunner(
  __dirname,
  {
    skipEsmAutoTransform: true,
    packageManager: 'npm',
    appExecutionPath: 'release/app',
    skip: () => process.platform === 'linux',
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: eventEnvelope({
          level: 'error',
          platform: 'javascript',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Some renderer error',
                stacktrace: {
                  frames: expect.arrayContaining([
                    {
                      filename: 'app:///dist/renderer/renderer.js',
                      function: expect.any(String),
                      lineno: expect.any(Number),
                      colno: expect.any(Number),
                      in_app: true,
                    },
                  ]),
                },
                mechanism: {
                  type: 'auto.browser.browserapierrors.setTimeout',
                  handled: false,
                },
              },
            ],
          },
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'renderer',
          },
          extra: {
            arguments: [],
          },
          request: {
            headers: {},
            url: 'app:///dist/renderer/index.html',
          },
        }),
      })
      .run();
  },
);
