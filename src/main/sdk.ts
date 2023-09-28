import { ensureProcess, IPCMode } from '../common';
ensureProcess('main');

import {
  defaultIntegrations as defaultNodeIntegrations,
  enableAnrDetection as enableNodeAnrDetection,
  init as nodeInit,
  NodeOptions,
} from '@sentry/node';
import { Integration, Options } from '@sentry/types';
import { app, Session, session, WebContents } from 'electron';

import { getDefaultEnvironment, getDefaultReleaseName } from './context';
import {
  AdditionalContext,
  ChildProcess,
  ElectronBreadcrumbs,
  MainContext,
  MainProcessSession,
  Net,
  OnUncaughtException,
  PreloadInjection,
  Screenshots,
  SentryMinidump,
} from './integrations';
import { configureIPC } from './ipc';
import { defaultStackParser } from './stack-parse';
import { ElectronOfflineTransportOptions, makeElectronOfflineTransport } from './transports/electron-offline-net';
import { SDK_VERSION } from './version';

export const defaultIntegrations: Integration[] = [
  new SentryMinidump(),
  new ElectronBreadcrumbs(),
  new Net(),
  new MainContext(),
  new ChildProcess(),
  new OnUncaughtException(),
  new PreloadInjection(),
  new AdditionalContext(),
  new Screenshots(),
  ...defaultNodeIntegrations.filter(
    (integration) => integration.name !== 'OnUncaughtException' && integration.name !== 'Context',
  ),
];

export interface ElectronMainOptionsInternal extends Options<ElectronOfflineTransportOptions> {
  /**
   * Inter-process communication mode to receive event and scope from renderers
   *
   * IPCMode.Classic - Configures Electron IPC
   * IPCMode.Protocol - Configures a custom protocol
   * IPCMode.Both - Configures both IPC and custom protocol
   *
   * defaults to IPCMode.Both for maximum compatibility
   */
  ipcMode: IPCMode;

  /**
   * A function that returns an array of Electron session objects
   *
   * These sessions are used to configure communication between the Electron
   * main and renderer processes.
   *
   * Defaults to () => [session.defaultSession]
   */
  getSessions: () => Session[];

  /**
   * Callback to allow custom naming of renderer processes.
   *
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?: (contents: WebContents) => string | undefined;

  /**
   * Screenshots may contain PII and is an opt-in feature
   *
   * If set to true, screenshots will be captured and included with all JavaScript events.
   * Screenshots are not included for native crashes since it's not possible to capture images of crashed Electron
   * renderers.
   */
  attachScreenshot?: boolean;
}

// getSessions and ipcMode properties are optional because they have defaults
export type ElectronMainOptions = Pick<Partial<ElectronMainOptionsInternal>, 'getSessions' | 'ipcMode'> &
  Omit<ElectronMainOptionsInternal, 'getSessions' | 'ipcMode'> &
  NodeOptions;

const defaultOptions: ElectronMainOptionsInternal = {
  _metadata: { sdk: { name: 'sentry.javascript.electron', version: SDK_VERSION } },
  ipcMode: IPCMode.Both,
  getSessions: () => [session.defaultSession],
};

/**
 * Initialize Sentry in the Electron main process
 */
export function init(userOptions: ElectronMainOptions): void {
  const options: ElectronMainOptionsInternal = Object.assign(defaultOptions, userOptions);
  const defaults = defaultIntegrations;

  if (process.env.SENTRY_ANR_CHILD_PROCESS) {
    options.autoSessionTracking = false;
    options.tracesSampleRate = 0;
  }

  // If we don't set a release, @sentry/node will automatically fetch from environment variables
  if (options.release === undefined) {
    options.release = getDefaultReleaseName();
  }

  // If we don't set an environment, @sentry/core defaults to production
  if (options.environment === undefined) {
    options.environment = getDefaultEnvironment();
  }

  // Unless autoSessionTracking is specifically disabled, we track sessions as the
  // lifetime of the Electron main process
  if (options.autoSessionTracking !== false) {
    defaults.push(new MainProcessSession());
    // We don't want nodejs autoSessionTracking
    options.autoSessionTracking = false;
  }

  if (options.stackParser === undefined) {
    options.stackParser = defaultStackParser;
  }

  setDefaultIntegrations(defaults, options);

  if (options.dsn && options.transport === undefined) {
    options.transport = makeElectronOfflineTransport;
  }

  configureIPC(options);
  nodeInit(options);
}

/** A list of integrations which cause default integrations to be removed */
const INTEGRATION_OVERRIDES = [
  { override: 'ElectronMinidump', remove: 'SentryMinidump' },
  { override: 'BrowserWindowSession', remove: 'MainProcessSession' },
];

/** Sets the default integrations and ensures that multiple minidump or session integrations are not enabled */
function setDefaultIntegrations(defaults: Integration[], options: ElectronMainOptions): void {
  if (options.defaultIntegrations === undefined) {
    const removeDefaultsMatching = (user: Integration[], defaults: Integration[]): Integration[] => {
      const toRemove = INTEGRATION_OVERRIDES.filter(({ override }) => user.some((i) => i.name === override)).map(
        ({ remove }) => remove,
      );

      return defaults.filter((i) => !toRemove.includes(i.name));
    };

    if (Array.isArray(options.integrations)) {
      options.defaultIntegrations = removeDefaultsMatching(options.integrations, defaults);
      return;
    } else if (typeof options.integrations === 'function') {
      const originalFn = options.integrations;

      options.integrations = (integrations) => {
        const resultIntegrations = originalFn(integrations);
        return removeDefaultsMatching(resultIntegrations, resultIntegrations);
      };
    }

    options.defaultIntegrations = defaults;
  }
}

type AnrOptions = Parameters<typeof enableNodeAnrDetection>[0];

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
 * await enableAnrDetection({ captureStackTrace: true });
 * runApp();
 *
 * // with CJS
 * enableAnrDetection({ captureStackTrace: true }).then(() => {
 *   runApp();
 * });
 * ```
 */
export async function enableAnrDetection(options: AnrOptions): Promise<void> {
  // We need to override the entryScript option to make it work with Electron which doesn't get passed a script in
  // the process.argv when the app is packaged

  // With CJS, we can get the entry script from process.mainModule
  if (options.entryScript === undefined) {
    // eslint-disable-next-line deprecation/deprecation
    options.entryScript = app.getAppPath();
  }

  return enableNodeAnrDetection(options);
}
