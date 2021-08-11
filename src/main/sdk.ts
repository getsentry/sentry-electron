import { defaultIntegrations as defaultNodeIntegrations, init as nodeInit, NodeOptions } from '@sentry/node';
import { Integration } from '@sentry/types';
import { WebContents } from 'electron';

import {
  ElectronEvents,
  MainContext,
  MainProcessSession,
  OnUncaughtException,
  PreloadInjection,
  RendererIPC,
  SentryMinidump,
} from './integrations';
import { ElectronNetTransport } from './transports/electron-net';

export const defaultIntegrations: Integration[] = [
  new SentryMinidump(),
  new ElectronEvents(),
  new MainContext(),
  new RendererIPC(),
  new OnUncaughtException(),
  new PreloadInjection(),
  ...defaultNodeIntegrations.filter((integration) => integration.name !== 'OnUncaughtException'),
];

export interface ElectronMainOptions extends NodeOptions {
  /**
   * Callback to allow custom naming of renderer processes
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?: (contents: WebContents) => string | undefined;
}

/**
 * Initialize Sentry in the Electron main process
 */
export function init(options: ElectronMainOptions): void {
  const defaults = defaultIntegrations;

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

  nodeInit(options);
}

/** Sets the default integrations and ensures that multiple minidump integrations are not set */
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
