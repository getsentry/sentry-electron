import { enableAnrDetection as enableNodeAnrDetection } from '@sentry/node';
import { app } from 'electron';

import { ELECTRON_MAJOR_VERSION } from './electron-normalize';

type MainProcessOptions = Parameters<typeof enableNodeAnrDetection>[0];

interface Options {
  /**
   * Main process ANR options.
   *
   * Set to false to disable ANR detection in the main process.
   */
  mainProcess?: MainProcessOptions | false;
}

function enableAnrMainProcess(options: MainProcessOptions): Promise<void> {
  if (ELECTRON_MAJOR_VERSION < 4) {
    throw new Error('Main process ANR detection is only supported on Electron v4+');
  }

  const mainOptions = {
    entryScript: app.getAppPath(),
    ...options,
  };

  return enableNodeAnrDetection(mainOptions);
}

/**
 * **Note** This feature is still in beta so there may be breaking changes in future releases.
 *
 * Starts a child process that detects Application Not Responding (ANR) errors.
 *
 * It's important to await on the returned promise before your app code to ensure this code does not run in the ANR
 * child process.
 *
 * ```js
 * import { init, enableAnrDetection } from '@sentry/electron';
 *
 * init({ dsn: "__DSN__" });
 *
 * // with ESM + Electron v28+
 * await enableAnrDetection({ mainProcess: { captureStackTrace: true }});
 * runApp();
 *
 * // with CJS
 * enableAnrDetection({ mainProcess: { captureStackTrace: true }}).then(() => {
 *   runApp();
 * });
 * ```
 */
export async function enableAnrDetection(options: Options = {}): Promise<void> {
  if (options.mainProcess !== false) {
    return enableAnrMainProcess(options.mainProcess || {});
  }

  return Promise.resolve();
}
