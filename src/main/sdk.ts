import { ensureProcess, IPCMode } from '../common';
ensureProcess('main');

import { defaultIntegrations as defaultNodeIntegrations, init as nodeInit, NodeOptions } from '@sentry/node';
import { Integration, Options } from '@sentry/types';
import { Session, session, WebContents } from 'electron';

import { getDefaultEnvironment, getDefaultReleaseName, getSdkInfo } from './context';
import { additionalContextIntegration } from './integrations/additional-context';
import { childProcessIntegration } from './integrations/child-process';
import { electronBreadcrumbsIntegration } from './integrations/electron-breadcrumbs';
import { mainContextIntegration } from './integrations/main-context';
import { mainProcessSessionIntegration } from './integrations/main-process-session';
import { electronNetIntegration } from './integrations/net-breadcrumbs';
import { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
import { preloadInjectionIntegration } from './integrations/preload-injection';
import { rendererProfilingIntegration } from './integrations/renderer-profiling';
import { screenshotsIntegration } from './integrations/screenshots';
import { sentryMinidumpIntegration } from './integrations/sentry-minidump';
import { configureIPC } from './ipc';
import { defaultStackParser } from './stack-parse';
import { ElectronOfflineTransportOptions, makeElectronOfflineTransport } from './transports/electron-offline-net';

export const defaultIntegrations: Integration[] = [
  sentryMinidumpIntegration(),
  electronBreadcrumbsIntegration(),
  electronNetIntegration(),
  mainContextIntegration(),
  childProcessIntegration(),
  onUncaughtExceptionIntegration(),
  preloadInjectionIntegration(),
  additionalContextIntegration(),
  screenshotsIntegration(),
  rendererProfilingIntegration(),
  // eslint-disable-next-line deprecation/deprecation
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

  /**
   * Enables injection of 'js-profiling' document policy headers and ensure profiles are forwarded with transactions
   *
   * Requires Electron 15+
   */
  enableRendererProfiling?: boolean;
}

// getSessions and ipcMode properties are optional because they have defaults
export type ElectronMainOptions = Pick<Partial<ElectronMainOptionsInternal>, 'getSessions' | 'ipcMode'> &
  Omit<ElectronMainOptionsInternal, 'getSessions' | 'ipcMode'> &
  NodeOptions;

const defaultOptions: ElectronMainOptionsInternal = {
  _metadata: { sdk: getSdkInfo() },
  ipcMode: IPCMode.Both,
  getSessions: () => [session.defaultSession],
};

/**
 * Initialize Sentry in the Electron main process
 */
export function init(userOptions: ElectronMainOptions): void {
  const options: ElectronMainOptionsInternal = Object.assign(defaultOptions, userOptions);
  const defaults = defaultIntegrations;

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
    defaults.push(mainProcessSessionIntegration());
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
