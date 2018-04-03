import { createAndBind } from '@sentry/core';
import { _callOnClient, getCurrentClient, SentryEvent } from '@sentry/shim';
import { ElectronOptions } from './backend';
import { ElectronFrontend } from './frontend';

/**
 * The Sentry Electron SDK Client.
 *
 * To use this SDK, call the {@link create} function as early as possible in the
 * entry modules. This applies to the main process as well as all renderer
 * processes or further sub processes you spawn. To set context information or
 * send manual events, use the provided methods.
 *
 * @example
 * const { create } = require('@sentry/electron');
 *
 * create({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * @example
 * import { setContext } from '@sentry/electron';
 * setContext({
 *   extra: { battery: 0.7 },
 *   tags: { user_mode: 'admin' },
 *   user: { id: '4711' },
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
export function create(options: ElectronOptions): void {
  createAndBind(ElectronFrontend, options);
}

/** Returns the current ElectronFrontend, if any. */
export function getCurrentFrontend(): ElectronFrontend {
  return getCurrentClient() as ElectronFrontend;
}

/**
 * Uploads a native crash dump (Minidump) to Sentry.
 *
 * @param path The relative or absolute path to the minidump.
 * @param event Optional event payload to attach to the minidump.
 */
export function captureMinidump(path: string, event: SentryEvent = {}): void {
  _callOnClient('captureMinidump', path, event);
}
