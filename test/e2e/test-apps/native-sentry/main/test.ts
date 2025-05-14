import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { runTwice: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope(
        {
          level: 'fatal',
          platform: 'native',
          tags: {
            'app-run': 'first',
            'event.environment': 'native',
            'event.origin': 'electron',
            'event.process': 'browser',
          },
          breadcrumbs: expect.arrayContaining([
            expect.objectContaining({
              timestamp: expect.any(Number),
              category: 'console',
              level: 'log',
              message: 'main process breadcrumb from first crashing run',
            }),
            expect.objectContaining({
              timestamp: expect.any(Number),
              category: 'console',
              level: 'log',
              message: 'renderer process breadcrumb from first crashing run',
            }),
            expect.objectContaining({
              timestamp: expect.any(Number),
              category: 'console',
              level: 'log',
              message: 'main process breadcrumb from second run',
            }),
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
});
