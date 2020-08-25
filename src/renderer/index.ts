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

import { defaultIntegrations, ReportDialogOptions } from '@sentry/browser';
import { getCurrentHub, initAndBind } from '@sentry/core';
import { _callOnClient } from '@sentry/minimal';
import { addExtensionMethods } from '@sentry/tracing';
import { Event } from '@sentry/types';

import { ElectronClient, ElectronOptions } from '../common';
import { RendererClient } from './client';
export { RendererBackend } from './backend';
export { RendererClient } from './client';

/**
 * Call init on @sentry/browser with all browser integrations
 * @param options ElectronOptions
 */
export function init(options: ElectronOptions): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }
  if (options.tracesSampleRate) {
    addExtensionMethods();
  }
  initAndBind(RendererClient, options);
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
export function captureMinidump(path: string, event: Event = {}): void {
  _callOnClient('captureMinidump', path, event);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<ElectronClient>();
  if (client) {
    return client.flush(timeout);
  }
  return Promise.reject(false);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<ElectronClient>();
  if (client) {
    return client.close(timeout);
  }
  return Promise.reject(false);
}
