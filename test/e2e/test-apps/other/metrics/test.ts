import { expect } from 'vitest';
import { SDK_VERSION } from '../../../../../src/main/version';
import { electronTestRunner, UUID_MATCHER } from '../../..';

electronTestRunner(__dirname, async (ctx) => {
  await ctx
    .expect({
      envelope: [
        { sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION } },
        [
          [
            {
              type: 'trace_metric',
              item_count: expect.any(Number),
              content_type: 'application/vnd.sentry.items.trace-metric+json',
            },
            {
              items: expect.arrayContaining([
                {
                  timestamp: expect.any(Number),
                  name: 'User profile updated',
                  type: 'counter',
                  value: 1,
                  trace_id: UUID_MATCHER,
                  attributes: expect.objectContaining({
                    'sentry.release': { value: 'electron-metrics@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                    userId: { value: 'user_123', type: 'string' },
                    updatedFields: { value: '["email","preferences"]', type: 'string' },
                  }),
                },
                {
                  timestamp: expect.any(Number),
                  trace_id: UUID_MATCHER,
                  name: 'User clicked submit button',
                  type: 'counter',
                  value: 1,
                  attributes: expect.objectContaining({
                    buttonId: { value: 'submit-form', type: 'string' },
                    formId: { value: 'user-profile', type: 'string' },
                    'sentry.release': { value: 'electron-metrics@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                    'electron.process': { value: 'renderer', type: 'string' },
                  }),
                },
              ]),
            },
          ],
        ],
      ],
    })
    .run();
});
