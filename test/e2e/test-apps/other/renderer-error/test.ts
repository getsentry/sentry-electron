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
              type: 'log',
              item_count: expect.any(Number),
              content_type: 'application/vnd.sentry.items.log+json',
            },
            {
              items: expect.arrayContaining([
                {
                  timestamp: expect.any(Number),
                  level: 'info',
                  body: 'electron.app.ready',
                  trace_id: UUID_MATCHER,
                  severity_number: 9,
                  attributes: {
                    'sentry.origin': 'auto.electron.events',
                    'sentry.release': { value: 'javascript-logs@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                    'sentry.message.template': { value: 'electron.%s.%s', type: 'string' },
                    'sentry.message.parameter.0': { value: 'app', type: 'string' },
                    'sentry.message.parameter.1': { value: 'ready', type: 'string' },
                  },
                },
                {
                  timestamp: expect.any(Number),
                  level: 'info',
                  body: 'User profile updated',
                  trace_id: UUID_MATCHER,
                  severity_number: 9,
                  attributes: {
                    userId: { value: 'user_123', type: 'string' },
                    updatedFields: { value: '["email","preferences"]', type: 'string' },
                    'sentry.release': { value: 'javascript-logs@1.0.0', type: 'string' },
                    'sentry.environment': { value: 'development', type: 'string' },
                    'sentry.sdk.name': { value: 'sentry.javascript.electron', type: 'string' },
                    'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
                  },
                },
                {
                  timestamp: expect.any(Number),
                  level: 'trace',
                  body: 'User clicked submit button',
                  trace_id: UUID_MATCHER,
                  severity_number: 1,
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
