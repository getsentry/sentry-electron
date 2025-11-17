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
                  level: 'info',
                  name: 'User profile updated',
                  type: 'count',
                  value: 1,
                  trace_id: UUID_MATCHER,
                  attributes: {
                    'sentry.release': { value: 'javascript-logs@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                    userId: { value: 'user_123', type: 'string' },
                    updatedFields: { value: '["email","preferences"]', type: 'string' },
                  },
                },
                {
                  timestamp: expect.any(Number),
                  trace_id: UUID_MATCHER,
                  name: 'User clicked submit button',
                  type: 'count',
                  value: 1,
                  attributes: {
                    buttonId: { value: 'submit-form', type: 'string' },
                    formId: { value: 'user-profile', type: 'string' },
                    timestamp: { value: expect.any(Number), type: 'integer' },
                    'sentry.release': { value: 'javascript-logs@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                  },
                },
              ]),
            },
          ],
        ],
      ],
    })
    .run();
});
