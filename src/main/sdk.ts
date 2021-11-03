import { defaultIntegrations as defaultNodeIntegrations, init as nodeInit, NodeOptions } from '@sentry/node';
import { Integration } from '@sentry/types';
import { Session, session, WebContents } from 'electron';

import { IPCMode } from '../common';
import { getDefaultReleaseName } from './context';
import {
  ElectronEvents,
  MainContext,
  MainProcessSession,
  OnUncaughtException,
  PreloadInjection,
  SentryMinidump,
} from './integrations';
import { configureIPC } from './ipc';
import { ElectronNetTransport } from './transports/electron-net';

export const defaultIntegrations: Integration[] = [
  new SentryMinidump(),
  new ElectronEvents(),
  new MainContext(),
  new OnUncaughtException(),
  new PreloadInjection(),
  ...defaultNodeIntegrations.filter((integration) => integration.name !== 'OnUncaughtException'),
];

export interface ElectronMainOptions extends NodeOptions {
  /**
   * Inter-process communication mode
   */
  ipcMode: IPCMode;
  /**
   * Callback to allow custom naming of renderer processes.
   *
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?: (contents: WebContents) => string | undefined;
  /**
   * A function that returns an array of Electron session objects
   *
   * These sessions are used to configure communication between the Electron
   * main and renderer processes.
   *
   * Defaults to () => [session.defaultSession]
   */
  getSessions: () => Session[];
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

  // Unless autoSessionTracking is specifically disabled, we track sessions as the
  // lifetime of the Electron main process
  if (options.autoSessionTracking !== false) {
    defaults.push(new MainProcessSession());
    // We don't want nodejs autoSessionTracking
    options.autoSessionTracking = false;
  }

  setDefaultIntegrations(defaults, options);

  if (options.dsn && options.transport === undefined) {
    options.transport = ElectronNetTransport;
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
