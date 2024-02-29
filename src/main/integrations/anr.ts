import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import { anrIntegration as nodeAnrIntegration } from '@sentry/node';
import { app } from 'electron';

import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';

/**
 * Starts a worker thread to detect App Not Responding (ANR) events
 */
export const anrIntegration = defineIntegration((options: Parameters<typeof nodeAnrIntegration>[0] = {}) => {
  if (ELECTRON_MAJOR_VERSION < 22) {
    throw new Error('Main process ANR detection requires Electron v22+');
  }

  return nodeAnrIntegration({
    ...options,
    staticTags: {
      'event.environment': 'javascript',
      'event.origin': 'electron',
      'event.process': 'browser',
      ...options.staticTags,
    },
    appRootPath: app.getAppPath(),
  });
});

/**
 * @deprecated Use `anrIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const Anr = convertIntegrationFnToClass(anrIntegration.name, anrIntegration);
