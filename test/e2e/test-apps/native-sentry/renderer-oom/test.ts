import { expect } from 'vitest';
import { electronTestRunner, eventEnvelope } from '../../..';

electronTestRunner(
  __dirname,
  {
    // Ensure we can OOM without killing whatever machine we're running on
    electronArgs: ['--js-flags=--max-old-space-size=128'],
    // This feature was only added in Electron 42
    skip: (electronVersion) => electronVersion.major < 42,
  },
  async (ctx) => {
    await ctx
      .expect({
        envelope: eventEnvelope(
          {
            level: 'fatal',
            platform: 'native',
            exception: {
              values: [
                {
                  type: 'OutOfMemoryError',
                  value: 'Renderer reached heap limit',
                  stacktrace: {
                    frames: [
                      {
                        filename: 'app:///src/index.html',
                        function: '(anonymous)',
                        in_app: true,
                        lineno: expect.any(Number),
                        colno: expect.any(Number),
                      },
                      {
                        filename: 'app:///src/index.html',
                        function: 'oomTrigger',
                        in_app: true,
                        lineno: expect.any(Number),
                        colno: expect.any(Number),
                      },
                    ],
                  },
                },
              ],
            },
            tags: {
              'event.environment': 'native',
              'event.origin': 'electron',
              'event.process': 'renderer',
              'exit.reason': expect.stringMatching(/(oom|crashed)/),
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
  },
);
