/* eslint-disable no-restricted-globals */
import {
  BrowserOptions,
  defaultIntegrations as defaultBrowserIntegrations,
  init as browserInit,
} from '@sentry/browser';
import { logger } from '@sentry/utils';

import { ensureProcess } from '../common';
import { ScopeToMain } from './integrations';
import { electronRendererStackParser } from './stack-parse';
import { makeRendererTransport } from './transport';

export const defaultIntegrations = [...defaultBrowserIntegrations, new ScopeToMain()];

/**
 * Initialize Sentry in the Electron renderer process
 * @param options SDK options
 * @param originalInit Optional init function for a specific framework SDK
 * @returns
 */
export function init<O extends BrowserOptions>(
  options: BrowserOptions & O = {} as BrowserOptions & O,
  // This parameter name ensures that TypeScript error messages contain a hint for fixing SDK version mismatches
  originalInit: (if_you_get_a_typescript_error_ensure_sdks_use_version_v7_37_1: O) => void = browserInit,
): void {
  ensureProcess('renderer');

  // Ensure the browser SDK is only init'ed once.
  if (window?.__SENTRY__RENDERER_INIT__) {
    logger.warn(`The browser SDK has already been initialized.
If init has been called in the preload and contextIsolation is disabled, is not required to call init in the renderer`);
    return;
  }

  window.__SENTRY__RENDERER_INIT__ = true;

  // We don't want browser session tracking enabled by default because we already have Electron
  // specific session tracking
  if (options.autoSessionTracking === undefined) {
    options.autoSessionTracking = false;
  }

  // Disable client reports for renderer as the sdk should only send
  // events using the main process.
  options.sendClientReports = false;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.stackParser === undefined) {
    options.stackParser = electronRendererStackParser;
  }

  if (options.dsn === undefined) {
    // Events are sent via the main process but browser SDK wont start without dsn
    options.dsn = 'https://12345@dummy.dsn/12345';
  }

  if (options.transport === undefined) {
    options.transport = makeRendererTransport;
  }

  // We only handle initialScope in the main process otherwise it can cause race conditions over IPC
  delete options.initialScope;

  originalInit(options);
}
