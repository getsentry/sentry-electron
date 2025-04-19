import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Not working on Linux with v29.4.6
    skip: (electronVersion) =>
      electronVersion.major < 22 || (process.platform === 'linux' && electronVersion.major === 29),
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
              'event.process': 'utility',
              'exit.reason': 'crashed',
            }),
            breadcrumbs: expect.arrayContaining([
              {
                timestamp: expect.any(Number),
                type: 'process',
                category: 'child-process',
                message: "'Utility' process exited with 'crashed'",
                level: 'fatal',
                data: expect.objectContaining({
                  type: 'Utility',
                  reason: 'crashed',
                  name: 'Node Utility Process',
                }),
              },
            ]),
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
