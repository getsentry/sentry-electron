import { dynamicRequire } from '@sentry/utils';

import { getIntegrations, removeEmptyIntegrations } from './integrations';
import { ElectronMainOptions } from './main';
import { BrowserOptions } from './renderer';

export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
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
  createTransport,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  FunctionToString,
  InboundFilters,
  trace,
} from '@sentry/core';

import type { enableAnrDetection as enableNodeAnrDetection } from '@sentry/node';

export const Integrations = getIntegrations();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ElectronOptions extends ElectronMainOptions, Omit<BrowserOptions, 'transportOptions' | 'transport'> {
  //
}

export { IPCMode } from './common';

interface ProcessEntryPoint {
  init: (options: Partial<ElectronOptions>) => void;
  close?: (timeout?: number) => Promise<boolean>;
  flush?: (timeout?: number) => Promise<boolean>;
  enableAnrDetection?(options: Parameters<typeof enableNodeAnrDetection>[0]): Promise<void>;
}

/** Fetches the SDK entry point for the current process */
function getEntryPoint(): ProcessEntryPoint {
  try {
    return process.type === 'browser' ? dynamicRequire(module, './main') : require('./renderer');
  } catch (e) {
    throw new Error(`Failed to automatically detect correct SDK entry point.

In the Electron main process you should import via:
import * as Sentry from '@sentry/electron/main';

In the Electron renderer process you should import via:
import * as Sentry from '@sentry/electron/renderer';`);
  }
}

/**
 * The Sentry Electron SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * entry modules. This applies to the main process as well as all renderer
 * processes or further sub processes you spawn. To set context information or
 * send manual events, use the provided methods.
 *
 * @example
 * const { init } = require('@sentry/electron');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * @example
 * import { configureScope } from '@sentry/electron';
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTags({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 *
 * @example
 * import { addBreadcrumb } from '@sentry/electron';
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * import * as Sentry from '@sentry/electron';
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 *
 * @see ElectronOptions for documentation on configuration options.
 */
export function init(options: Partial<ElectronOptions>): void {
  // Filter out any EmptyIntegrations
  removeEmptyIntegrations(options);

  getEntryPoint().init(options);
}

/**
 * Call `close()` on the current client, if there is one. See {@link Client.close}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue before shutting down. Omitting this
 * parameter will cause the client to wait until all events are sent before disabling itself.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function close(timeout?: number): Promise<boolean> {
  const entryPoint = getEntryPoint();

  if (entryPoint.close) {
    return entryPoint.close(timeout);
  }

  throw new Error('The Electron SDK should be closed from the main process');
}

/**
 * Call `flush()` on the current client, if there is one. See {@link Client.flush}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue. Omitting this parameter will cause
 * the client to wait until all events are sent before resolving the promise.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function flush(timeout?: number): Promise<boolean> {
  const entryPoint = getEntryPoint();

  if (entryPoint.flush) {
    return entryPoint.flush(timeout);
  }

  throw new Error('The Electron SDK should be flushed from the main process');
}

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
 * // with ESM + Node 14+
 * await enableAnrDetection({ captureStackTrace: true });
 * runApp();
 *
 * // with CJS or Node 10+
 * enableAnrDetection({ captureStackTrace: true }).then(() => {
 *   runApp();
 * });
 * ```
 */
export async function enableAnrDetection(options: Parameters<typeof enableNodeAnrDetection>[0]): Promise<void> {
  const entryPoint = getEntryPoint();

  if (entryPoint.enableAnrDetection) {
    return entryPoint.enableAnrDetection(options);
  }

  throw new Error('ANR detection should be started in the main process');
}
