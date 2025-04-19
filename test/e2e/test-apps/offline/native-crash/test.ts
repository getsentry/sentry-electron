import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    runTwice: true,
    timeout: 25_000,
    skip: (electronVersion) => process.platform === 'win32' && electronVersion.major < 24,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: eventEnvelope(
          {
            level: 'fatal',
            platform: 'native',
            tags: expect.objectContaining({
              'event.environment': 'native',
              'event.origin': 'electron',
              'event.process': 'renderer',
            }),
          },
          [
            {
              type: 'attachment',
              length: expect.any(Number),
              filename: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.dmp$/),
              attachment_type: 'event.minidump',
            },
            expect.any(Buffer),
          ],
        ),
      })
      .run();
  },
);
