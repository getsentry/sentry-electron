import { convertIntegrationFnToClass } from '@sentry/core';
import { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';
import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

import { IPCMode } from '../../common';
import { rendererRequiresCrashReporterStart } from '../electron-normalize';
import { ElectronMainOptionsInternal } from '../sdk';

// After bundling with webpack, require.resolve can return number so we include that in the types
// to ensure we check for that!
function getPreloadPath(): string | number | undefined {
  try {
    return rendererRequiresCrashReporterStart()
      ? require.resolve('../../preload/legacy.js')
      : require.resolve('../../preload/index.js');
  } catch (_) {
    try {
      // This could be ESM
      const currentDir = fileURLToPath(import.meta.url);
      // Use the CJS preload
      return resolve(currentDir, '..', '..', '..', '..', 'preload', 'index.js');
    } catch (_) {
      //
    }
  }

  return undefined;
}

const INTEGRATION_NAME = 'PreloadInjection';

const preloadInjection: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options = client.getOptions() as ElectronMainOptionsInternal;

      // If classic IPC mode is disabled, we shouldn't attempt to inject preload scripts
      // eslint-disable-next-line no-bitwise
      if ((options.ipcMode & IPCMode.Classic) == 0) {
        return;
      }

      app.once('ready', () => {
        const path = getPreloadPath();

        if (path && typeof path === 'string' && isAbsolute(path) && existsSync(path)) {
          for (const sesh of options.getSessions()) {
            // Fetch any existing preloads so we don't overwrite them
            const existing = sesh.getPreloads();
            sesh.setPreloads([path, ...existing]);
          }
        } else {
          logger.log(
            'The preload script could not be injected automatically. This is most likely caused by bundling of the main process',
          );
        }
      });
    },
  };
};

/**
 * Injects the preload script into the provided sessions.
 *
 * Defaults to injecting into the defaultSession
 */
// eslint-disable-next-line deprecation/deprecation
export const PreloadInjection = convertIntegrationFnToClass(INTEGRATION_NAME, preloadInjection);
