import { defaultIntegrations as defaultNodeIntegrations, init as nodeInit, NodeOptions } from '@sentry/node';
import { Integration } from '@sentry/types';
import { Session, session, WebContents } from 'electron';

import { IPCMode } from '../common';
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
  SentryMinidump,
} from './integrations';
import { configureIPC } from './ipc';
import { ElectronOfflineNetTransport } from './transports/electron-offline-net';

export const defaultIntegrations: Integration[] = [
  new SentryMinidump(),
  new ElectronBreadcrumbs(),
  new Net(),
  new MainContext(),
  new ChildProcess(),
  new OnUncaughtException(),
  new PreloadInjection(),
  new AdditionalContext(),
  ...defaultNodeIntegrations.filter((integration) => integration.name !== 'OnUncaughtException'),
];

export interface ElectronMainOptions extends NodeOptions {
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
}

const defaultOptions: ElectronMainOptions = {
  ipcMode: IPCMode.Both,
  getSessions: () => [session.defaultSession],
};

/**
 * Initialize Sentry in the Electron main process
 */
export function init(partialOptions: Partial<ElectronMainOptions>): void {
  const options: ElectronMainOptions = Object.assign(defaultOptions, partialOptions);
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
    defaults.push(new MainProcessSession());
    // We don't want nodejs autoSessionTracking
    options.autoSessionTracking = false;
  }

  setDefaultIntegrations(defaults, options);

  if (options.dsn && options.transport === undefined) {
    options.transport = ElectronOfflineNetTransport;
  }

  configureIPC(options);
  nodeInit(options);
}

/** Sets the default integrations and ensures that multiple minidump integrations are not enabled */
function setDefaultIntegrations(defaults: Integration[], options: ElectronMainOptions): void {
  if (options.defaultIntegrations === undefined) {
    // If ElectronMinidump has been included, automatically remove SentryMinidump
    if (Array.isArray(options.integrations) && options.integrations.some((i) => i.name === 'ElectronMinidump')) {
      options.defaultIntegrations = defaults.filter((integration) => integration.name !== 'SentryMinidump');
      return;
    } else if (typeof options.integrations === 'function') {
      const originalFn = options.integrations;

      options.integrations = (integrations) => {
        const userIntegrations = originalFn(integrations);
        return userIntegrations.some((i) => i.name === 'ElectronMinidump')
          ? userIntegrations.filter((integration) => integration.name !== 'SentryMinidump')
          : userIntegrations;
      };
    }

    options.defaultIntegrations = defaults;
  }
}
