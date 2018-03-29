import { createAndBind } from '@sentry/core';
import { _callOnClient, getCurrentClient, SentryEvent } from '@sentry/shim';
import { ElectronOptions } from './backend';
import { ElectronFrontend } from './frontend';

/**
 * The Sentry Electron SDK Client.
 *
 * To use this SDK, call the {@link Sdk.create} function as early as possible
 * in the entry modules. This applies to the main process as well as all
 * renderer processes or further sub processes you spawn. To set context
 * information or send manual events, use the provided methods.
 *
 * @example
 * const { SentryClient } = require('@sentry/electron');
 *
 * SentryClient.create({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * @example
 * SentryClient.setContext({
 *   extra: { battery: 0.7 },
 *   tags: { user_mode: 'admin' },
 *   user: { id: '4711' },
 * });
 *
 * @example
 * SentryClient.addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * SentryClient.captureMessage('Hello, world!');
 * SentryClient.captureException(new Error('Good bye'));
 * SentryClient.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 *
 * @see ElectronOptions for documentation on configuration options.
 */
export function create(options: ElectronOptions): void {
  createAndBind(ElectronFrontend, options);
}

/** Returns the current ElectronFrontend, if any. */
export function getCurrentFrontend(): ElectronFrontend {
  return getCurrentClient() as ElectronFrontend;
}

/**
 * TODO
 *
 * @param path
 * @param event
 */
export function captureMinidump(path: string, event: SentryEvent = {}): void {
  _callOnClient('captureMinidump', path, event);
}
