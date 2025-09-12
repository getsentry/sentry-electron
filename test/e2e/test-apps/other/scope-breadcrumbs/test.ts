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
                  type: 'auto.browser.browserapierrors.setTimeout',
                },
              },
            ],
          },
          breadcrumbs: expect.arrayContaining([
            expect.objectContaining({
              category: 'console',
              level: 'log',
              message: 'Some logging from the main process',
              timestamp: expect.any(Number),
            }),
            expect.objectContaining({
              timestamp: expect.any(Number),
              category: 'console',
              level: 'log',
              message: 'Some logging from the renderer process',
            }),
          ]),
          request: {
            headers: {},
            url: 'app:///src/index.html',
          },
          tags: {
            'event.environment': 'javascript',
            'event.origin': 'electron',
            'event.process': 'renderer',
            'a-tag': 'tag-value',
            'renderer-tag': 'another-value',
          },
          extra: {
            arguments: [],
            'some-extra': 'extra-value',
          },
          user: {
            id: '1234567890',
          },
        },
        [{ type: 'attachment', length: 15, filename: 'screenshot.png' }, Buffer.from('captureScreen()', 'utf-8')],
      ),
    })
    .run();
});
