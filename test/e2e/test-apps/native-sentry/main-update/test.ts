import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { runTwice: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope(
        {
          release: 'native-sentry-main-update@1.0.0',
          level: 'fatal',
          platform: 'native',
          tags: {
            'event.environment': 'native',
            'event.origin': 'electron',
            'event.process': 'browser',
          },
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
});
