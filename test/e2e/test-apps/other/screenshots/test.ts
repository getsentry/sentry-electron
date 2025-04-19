import { expect } from 'vitest';

import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(__dirname, { skipEsmAutoTransform: true }, async (ctx) => {
  await ctx
    .expect({
      envelope: eventEnvelope(
        {
          level: 'error',
          platform: 'javascript',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Some renderer error',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: {
                  handled: false,
                  type: 'instrument',
                  data: {
                    function: 'setTimeout',
                  },
                },
              },
            ],
          },
          request: {
            headers: {},
            url: 'app:///src/index.html',
          },
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'renderer',
          },
          extra: {
            arguments: [],
          },
        },
        [
          {
            type: 'attachment',
            length: expect.any(Number),
            filename: 'screenshot.png',
            content_type: 'image/png',
          },
          expect.any(Buffer),
        ],
      ),
    })
    .run();
});
