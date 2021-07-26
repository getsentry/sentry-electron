import {
  BrowserOptions,
  defaultIntegrations as defaultBrowserIntegrations,
  init as browserInit,
} from '@sentry/browser';

import { EventToMain, ScopeToMain } from './integrations';

export const defaultIntegrations = [...defaultBrowserIntegrations, new ScopeToMain(), new EventToMain()];

/**
 * Initialize Sentry in the Electron renderer process
 */
export function init(options: BrowserOptions): void {
  options.autoSessionTracking = false;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.dsn === undefined) {
    // Events are sent by the main process and this allows everything to work without supplying a dsn in the renderer
    options.dsn = 'https://12345@dummy.dsn/12345';
  }

  // We only handle initialScope in the main process otherwise it can cause race conditions over IPC
  delete options.initialScope;

  browserInit(options);
}
