import {
  BrowserOptions,
  defaultIntegrations as defaultBrowserIntegrations,
  init as browserInit,
} from '@sentry/browser';
import { SentryError } from '@sentry/utils';

import { EventToMain, ScopeToMain } from './integrations';

export const defaultIntegrations = [...defaultBrowserIntegrations, new ScopeToMain(), new EventToMain()];

/**
 * Initialize Sentry in the Electron renderer process
 */
export function init(options: BrowserOptions): void {
  // eslint-disable-next-line no-restricted-globals
  if (window.__SENTRY_IPC__ === undefined) {
    throw new SentryError(`Communication with the Electron main process could not be established.

This is likely because the preload script was not run.
Preload scripts are usually injected automatically but this can fail if you are bundling the Electron main process code.

The required preload code can be imported via:
  require('@sentry/electron/preload');
or
  import '@sentry/electron/preload';

Check out the Webpack test app for an example of how to configure this:
https://github.com/getsentry/sentry-electron/blob/master/test/e2e/test-apps/isolated-app`);
  }

  // We don't want browser session tracking enabled by default because we already have Electron
  // specific session tracking
  if (options.autoSessionTracking === undefined) {
    options.autoSessionTracking = false;
  }

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.dsn === undefined) {
    // Events are sent via the main process but browser SDK wont start without dsn
    options.dsn = 'https://12345@dummy.dsn/12345';
  }

  // We only handle initialScope in the main process otherwise it can cause race conditions over IPC
  delete options.initialScope;

  browserInit(options);
}
