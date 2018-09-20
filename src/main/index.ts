// tslint:disable-next-line
require('util.promisify/shim')();
import { initAndBind, Integrations as CoreIntegrations } from '@sentry/core';
import { defaultIntegrations } from '@sentry/node';
import { ElectronOptions } from '..';
import { MainClient } from './client';
import { Electron, OnUncaughtException } from './integrations';
import { NetTransport } from './transports/net';
export { MainClient } from './client';
export { MainBackend } from './backend';
export { Integrations as NodeIntegrations } from '@sentry/node';
import { SDK_NAME } from '../sdk';

// tslint:disable-next-line:variable-name
export const ElectronIntegrations = { Electron, OnUncaughtException };

/** SDK version used in every event. */
// tslint:disable-next-line
export const SDK_VERSION: string = require('../../package.json').version;

/**
 * Init call to node, if no transport is set, we use net of electron
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  const electronIntegrations = defaultIntegrations.filter(integration => integration.name !== 'OnUncaughtException');
  initAndBind(
    MainClient,
    {
      transport: NetTransport,
      ...options,
    },
    [
      ...electronIntegrations,
      // tslint:disable-next-line:no-unbound-method
      new OnUncaughtException({ onFatalError: options.onFatalError }),
      new Electron(),
      new CoreIntegrations.SDKInformation({
        name: 'npm:@sentry/electron',
        sdkName: SDK_NAME,
        sdkVersion: SDK_VERSION,
      }),
    ],
  );
}
