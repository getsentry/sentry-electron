import { defineIntegration } from '@sentry/core';
import { anrIntegration as nodeAnrIntegration } from '@sentry/node';
import { app, powerMonitor } from 'electron';

import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';

/**
 * Starts a worker thread to detect App Not Responding (ANR) events
 */
export const anrIntegration = defineIntegration((options: Parameters<typeof nodeAnrIntegration>[0] = {}) => {
  if (ELECTRON_MAJOR_VERSION < 22) {
    throw new Error('Main process ANR detection requires Electron v22+');
  }

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

  powerMonitor.on('resume', () => {
    integration.startWorker();
  });

  return integration;
});
