import { defineIntegration, Integration } from '@sentry/core';
import { anrIntegration as nodeAnrIntegration } from '@sentry/node';
import { app, powerMonitor } from 'electron';
import { ELECTRON_MAJOR_VERSION } from '../electron-normalize.js';

// eslint-disable-next-line deprecation/deprecation
type Options = Parameters<typeof nodeAnrIntegration>[0];

/**
 * Starts a worker thread to detect App Not Responding (ANR) events
 *
 * @deprecated The ANR integration has been deprecated. Use `eventLoopBlockIntegration` from `@sentry/electron/native`
 * instead. You will need to install `@sentry/node-native` as a dependency.
 */
export const anrIntegration: (options: Options) => Integration = defineIntegration((options: Options = {}) => {
  if (ELECTRON_MAJOR_VERSION < 22) {
    throw new Error('Main process ANR detection requires Electron v22+');
  }

  // eslint-disable-next-line deprecation/deprecation
  const integration = nodeAnrIntegration({
    ...options,
    staticTags: {
      'event.environment': 'javascript',
      'event.origin': 'electron',
      'event.process': 'browser',
      ...options.staticTags,
    },
    appRootPath: app.getAppPath(),
  });

  powerMonitor.on('suspend', () => {
    integration.stopWorker();
  });

  powerMonitor.on('lock-screen', () => {
    integration.stopWorker();
  });

  powerMonitor.on('resume', () => {
    integration.startWorker();
  });

  powerMonitor.on('unlock-screen', () => {
    integration.startWorker();
  });

  return integration;
});
