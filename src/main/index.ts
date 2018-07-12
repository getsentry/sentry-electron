// tslint:disable-next-line
require('util.promisify/shim')();
import { initAndBind } from '@sentry/core';
import { defaultIntegrations } from '@sentry/node';
import { ElectronOptions } from '..';
import { MainClient } from './client';
import { Electron } from './integrations/electron';
import { NonExitOnUncaughtException } from './integrations/nonexitonuncaughtexception';
import { NetTransport } from './transports/net';
export { MainClient } from './client';
export { MainBackend } from './backend';

/**
 * Init call to node, if no transport is set, we use net of electron
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  const electronIntegrations = defaultIntegrations.filter(
    integration => integration.name != 'OnUncaughtException',
  );
  initAndBind(
    MainClient,
    {
      transport: NetTransport,
      ...options,
    },
    [...electronIntegrations, new NonExitOnUncaughtException(), new Electron()],
  );
}
