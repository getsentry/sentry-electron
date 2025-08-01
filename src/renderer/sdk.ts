/* eslint-disable deprecation/deprecation */
/* eslint-disable no-restricted-globals */
import {
  BrowserOptions,
  getDefaultIntegrations as getDefaultBrowserIntegrations,
  init as browserInit,
} from '@sentry/browser';
import { debug, Integration } from '@sentry/core';
import { RendererProcessAnrOptions } from '../common/ipc';
import { eventLoopBlockIntegration } from './integrations/event-loop-block';
import { scopeToMainIntegration } from './integrations/scope-to-main';
import { electronRendererStackParser } from './stack-parse';
import { makeRendererTransport } from './transport';

/** Get the default integrations for the renderer SDK. */
export function getDefaultIntegrations(options: ElectronRendererOptions): Integration[] {
  return [
    ...getDefaultBrowserIntegrations(options).filter((i) => i.name !== 'BrowserSession'),
    scopeToMainIntegration(),
  ];
}

interface ElectronRendererOptions extends Omit<BrowserOptions, 'dsn' | 'environment' | 'release'> {
  /**
   * @deprecated Use `eventLoopBlockIntegration` instead.
   *
   * ```
   * import * as Sentry from '@sentry/electron/renderer';
   * Sentry.init({
   *   dsn: '__YOUR_DSN__',
   *   integrations: [
   *     Sentry.eventLoopBlockIntegration({ threshold: 1000 }),
   *   ],
   * });
   * ```
   */
  anrDetection?: Partial<RendererProcessAnrOptions> | boolean;

  /** @deprecated `dsn` should only be passed to the main process `Sentry.init` call */
  dsn?: string;
  /** @deprecated `release` should only be passed to the main process `Sentry.init` call */
  release?: string;
  /** @deprecated `environment` should only be passed to the main process `Sentry.init` call */
  environment?: string;
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
  originalInit: (if_you_get_a_typescript_error_ensure_sdks_use_version_v9_43_0: O) => void = browserInit,
): void {
  // Ensure the browser SDK is only init'ed once.
  if (window?.__SENTRY__RENDERER_INIT__) {
    debug.warn(`The browser SDK has already been initialized.
If init has been called in the preload and contextIsolation is disabled, is not required to call init in the renderer`);
    return;
  }

  window.__SENTRY__RENDERER_INIT__ = true;

  // Disable client reports for renderer as the sdk should only send
  // events using the main process.
  options.sendClientReports = false;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  if (options.stackParser === undefined) {
    options.stackParser = electronRendererStackParser;
  }

  // eslint-disable-next-line deprecation/deprecation
  if (options.dsn === undefined) {
    // Events are sent via the main process but browser SDK wont start without dsn
    // eslint-disable-next-line deprecation/deprecation
    options.dsn = 'https://12345@dummy.dsn/12345';
  }

  if (options.transport === undefined) {
    options.transport = makeRendererTransport;
  }

  // TODO: Next major version, remove the deprecated anrDetection option
  if (options.anrDetection) {
    const integrationOptions =
      options.anrDetection === true
        ? {
            threshold: 5_000,
            pollInterval: 1_000,
            captureStackTrace: false,
          }
        : {
            threshold: options.anrDetection.anrThreshold || 5_000,
            pollInterval: options.anrDetection.pollInterval || 1_000,
            captureStackTrace: options.anrDetection.captureStackTrace || false,
          };

    const integration = eventLoopBlockIntegration(integrationOptions);

    if (typeof options.integrations === 'function') {
      const originalFn = options.integrations;
      options.integrations = (integrations) => [...originalFn(integrations), integration];
    } else {
      options.integrations = options.integrations || [];
      options.integrations.push(integration);
    }
  }

  // We only handle initialScope in the main process otherwise it can cause race conditions over IPC
  delete options.initialScope;

  originalInit(options);
}
