import { defineIntegration, Integration } from '@sentry/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  disableBlockDetectionForCallback,
  eventLoopBlockIntegration as nodeEventLoopBlockIntegration,
  pauseEventLoopBlockDetection,
  restartEventLoopBlockDetection,
} from '@sentry/node-native';
import { app, powerMonitor } from 'electron';

type IntegrationInternal = { start: () => void; stop: () => void };

type Options = Parameters<typeof nodeEventLoopBlockIntegration>[0];

/**
 * > **Note**
 * >
 * > You should add `@sentry/node-native` to your dependencies to use this integration.
 *
 * Monitors the Node.js event loop for blocking behavior and reports blocked events to Sentry.
 *
 * Uses a background worker and native module to detect when the main thread is blocked for longer than the configured
 * threshold (default: 1 second). When a block is detected, it captures an event with stack traces for every thread.
 *
 * ```js
 * import * as Sentry from '@sentry/electron/main';
 * import { eventLoopBlockIntegration } from '@sentry/electron/native';
 *
 * Sentry.init({
 *   dsn: '__YOUR_DSN__',
 *   integrations: [
 *     eventLoopBlockIntegration({
 *       threshold: 500, // Report blocks longer than 500ms
 *     }),
 *   ],
 * });
 * ```
 */
export const eventLoopBlockIntegration: (options: Options) => Integration = defineIntegration(
  (options: Options = {}) => {
    if (process.type === 'renderer') {
      throw new Error(
        'Detected `eventLoopBlockIntegration` in renderer process. This integration should only be used in the Electron main process.',
      );
    }

    const integration = nodeEventLoopBlockIntegration({
      ...options,
      staticTags: {
        'event.environment': 'javascript',
        'event.origin': 'electron',
        'event.process': 'browser',
        ...options.staticTags,
      },
      appRootPath: app.getAppPath(),
    }) as Integration & IntegrationInternal;

    powerMonitor.on('suspend', () => {
      integration.stop();
    });

    powerMonitor.on('lock-screen', () => {
      integration.stop();
    });

    powerMonitor.on('resume', () => {
      integration.start();
    });

    powerMonitor.on('unlock-screen', () => {
      integration.start();
    });

    return integration;
  },
);

export { disableBlockDetectionForCallback, pauseEventLoopBlockDetection, restartEventLoopBlockDetection };
