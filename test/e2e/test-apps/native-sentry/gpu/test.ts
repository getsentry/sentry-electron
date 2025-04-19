import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // The GPU process is not reliable on Linux in GHA
    skip: () => process.platform === 'linux',
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
              'event.process': 'GPU',
              'exit.reason': 'crashed',
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
