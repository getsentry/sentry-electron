import { expect } from 'vitest';
import { electronTestRunner, expectedEvent, SDK_VERSION } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      minidump: {
        event: expectedEvent({
          // Timestamp is not available via the minidump endpoint
          timestamp: undefined,
          // Trace context is not available via the minidump endpoint
          contexts: {
            trace: undefined,
          },
          // Integrations are not included via the minidump endpoint
          sdk: {
            name: 'sentry.javascript.electron',
            packages: [
              {
                name: 'npm:@sentry/electron',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
          level: 'fatal',
          platform: 'native',
          tags: {
            'event.origin': 'electron',
            'event.environment': 'native',
            'event.process': 'browser',
          },
          breadcrumbs: expect.arrayContaining([
            {
              timestamp: expect.any(Number),
              category: 'electron',
              message: 'app.ready',
              type: 'ui',
            },
          ]),
          user: { username: 'some_user' },
        }),
        dumpFile: expect.any(Buffer),
        namespacedData: {
          initialScope: {
            environment: 'development',
            release: 'custom-name',
            user: {
              username: 'some_user',
            },
          },
        },
      },
    })
    .run();
});
