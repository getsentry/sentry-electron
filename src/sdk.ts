export const SDK_NAME = 'sentry.javascript.electron';
// Version will be taken directly from package.json in sdkinformation.ts integration

import { ReportDialogOptions } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';
import { _callOnClient } from '@sentry/minimal';
import { SentryEvent } from '@sentry/types';
import { ElectronOptions } from './common';
import { ElectronClient, specificInit } from './dispatch';

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
export function init(options: ElectronOptions): void {
  specificInit(options);
}

/**
 * Present the user with a report dialog.
 *
 * @param options Everything is optional, we try to fetch all info need from the global scope.
 */
export function showReportDialog(options: ReportDialogOptions = {}): void {
  (getCurrentHub().getClient() as ElectronClient).showReportDialog(options);
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
