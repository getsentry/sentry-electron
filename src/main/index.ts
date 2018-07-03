// tslint:disable-next-line
require('util.promisify/shim')();
import { initAndBind } from '@sentry/core';
import { Integrations as NodeIntegrations } from '@sentry/node';
import { ElectronOptions } from '..';
import { MainClient } from './client';
import { NetTransport } from './transports/net';
export { MainClient } from './client';
export { MainBackend } from './backend';

/**
 * TODO
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  options.transport = NetTransport;
  initAndBind(MainClient, options, [
    new NodeIntegrations.Console(),
    new NodeIntegrations.Http(),
    new NodeIntegrations.OnUncaughtException(),
    new NodeIntegrations.OnUnhandledRejection(),
  ]);
}
