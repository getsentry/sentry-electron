/* eslint-disable no-restricted-globals */
import {
  BrowserOptions,
  getDefaultIntegrations as getDefaultBrowserIntegrations,
  init as browserInit,
} from '@sentry/browser';
import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { RendererProcessAnrOptions } from '../common/ipc';
import { enableAnrRendererMessages } from './anr';
import { scopeToMainIntegration } from './integrations/scope-to-main';
import { electronRendererStackParser } from './stack-parse';
import { makeRendererTransport } from './transport';

/** Get the default integrations for the renderer SDK. */
export function getDefaultIntegrations(options: ElectronRendererOptions): Integration[] {
  return [...getDefaultBrowserIntegrations(options), scopeToMainIntegration()];
}

interface ElectronRendererOptions extends BrowserOptions {
  /**
   * Enables ANR detection in this renderer process.
   *
   * Optionally accepts an object of options to configure ANR detection.
   *
   * {
   *   pollInterval: number; // Defaults to 1000ms
   *   anrThreshold: number; // Defaults to 5000ms
   *   captureStackTrace: boolean; // Defaults to false
   * }
   *
   * Defaults to 'false'.
   */
  anrDetection?: Partial<RendererProcessAnrOptions> | boolean;
}

/**
 * Initialize Sentry in the Electron renderer process
 * @param options SDK options
 * @param originalInit Optional init function for a specific framework SDK
 * @returns
 */
export function init<O extends ElectronRendererOptions>(
  options: ElectronRendererOptions & O = {} as ElectronRendererOptions & O,
  // This parameter name ensures that TypeScript error messages contain a hint for fixing SDK version mismatches
  originalInit: (if_you_get_a_typescript_error_ensure_sdks_use_version_v8_37_1: O) => void = browserInit,
): void {
  // Ensure the browser SDK is only init'ed once.
  if (window?.__SENTRY__RENDERER_INIT__) {
    logger.warn(`The browser SDK has already been initialized.
If init has been called in the preload and contextIsolation is disabled, is not required to call init in the renderer`);
    return;
  }

  window.__SENTRY__RENDERER_INIT__ = true;

  // We don't want browser session tracking enabled by default because we already have Electron
  // specific session tracking from the main process.
  if (options.autoSessionTracking === undefined) {
    options.autoSessionTracking = false;
  }

  // Disable client reports for renderer as the sdk should only send
  // events using the main process.
  options.sendClientReports = false;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
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

  if (options.anrDetection) {
    enableAnrRendererMessages(options.anrDetection === true ? {} : options.anrDetection);
  }

  // We only handle initialScope in the main process otherwise it can cause race conditions over IPC
  delete options.initialScope;

  originalInit(options);
}
