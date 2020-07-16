// tslint:disable-next-line
require('util.promisify/shim')();
export {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from '@sentry/types';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/core';

import { initAndBind } from '@sentry/core';
import * as coreDefaultIntegrations from '@sentry/core/esm/integrations';
import { _callOnClient } from '@sentry/minimal';
import * as nodeDefaultIntegrations from '@sentry/node/esm/integrations';
import { Event } from '@sentry/types';

import { ElectronOptions } from '../common';

import { MainClient } from './client';
import { Electron, OnUncaughtException } from './integrations';
import { NetTransport } from './transports/net';
export { MainClient } from './client';
export { MainBackend } from './backend';
export { Integrations as NodeIntegrations } from '@sentry/node';

const defaultIntegrations = [
  // Common
  new coreDefaultIntegrations.InboundFilters(),
  new coreDefaultIntegrations.FunctionToString(),
  // Native Wrappers
  new nodeDefaultIntegrations.Console(),
  new nodeDefaultIntegrations.Http(),
  // Global Handlers
  new nodeDefaultIntegrations.OnUncaughtException(),
  new nodeDefaultIntegrations.OnUnhandledRejection(),
  // Misc
  new nodeDefaultIntegrations.LinkedErrors(),
];

// tslint:disable-next-line:variable-name
export const ElectronIntegrations = { Electron, OnUncaughtException };

/**
 * Init call to node, if no transport is set, we use net of electron
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  const electronIntegrations = defaultIntegrations.filter(integration => integration.name !== 'OnUncaughtException');
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [
      ...electronIntegrations,
      // tslint:disable-next-line:no-unbound-method
      new OnUncaughtException({ onFatalError: options.onFatalError }),
      new Electron(),
    ];
  }
  initAndBind(MainClient, {
    transport: NetTransport,
    ...options,
  });
}

/**
 * This function does nothing, call it in the renderer
 */
export function showReportDialog(): void {
  // noop
}

/**
 * Uploads a native crash dump (Minidump) to Sentry.
 *
 * @param path The relative or absolute path to the minidump.
 * @param event Optional event payload to attach to the minidump.
 */
export function captureMinidump(path: string, event: Event = {}): void {
  _callOnClient('captureMinidump', path, event);
}
