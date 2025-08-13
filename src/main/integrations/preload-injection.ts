import { debug, defineIntegration } from '@sentry/core';
import { app } from 'electron';
import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { IPCMode } from '../../common/ipc.js';
import { setPreload } from '../electron-normalize.js';
import { ElectronMainOptionsInternal } from '../sdk.js';

// After bundling with webpack, require.resolve can return number so we include that in the types
// to ensure we check for that!
function getPreloadPath(): string | number | undefined {
  try {
    return require.resolve('../../preload/index.js');
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

/**
 * Injects the preload script into the provided sessions.
 *
 * Defaults to injecting into the defaultSession
 */
export const preloadInjectionIntegration = defineIntegration(() => {
  return {
    name: 'PreloadInjection',
    setup(client) {
      const options = client.getOptions() as ElectronMainOptionsInternal;

      // If classic IPC mode is disabled, we shouldn't attempt to inject preload scripts
      // eslint-disable-next-line no-bitwise
      if ((options.ipcMode & IPCMode.Classic) === 0) {
        return;
      }

      app.once('ready', () => {
        const path = getPreloadPath();

        if (path && typeof path === 'string' && isAbsolute(path) && existsSync(path)) {
          for (const sesh of options.getSessions()) {
            setPreload(sesh, path);
          }
        } else {
          debug.log(
            'The preload script could not be injected automatically. This is most likely caused by bundling of the main process',
          );
        }
      });
    },
  };
});
