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

import { ReportDialogOptions } from '@sentry/browser/esm/helpers';
import * as defaultIntegrations from '@sentry/browser/esm/integrations';
import { getCurrentHub, initAndBind } from '@sentry/core';
import * as coreDefaultIntegrations from '@sentry/core/esm/integrations';
import { _callOnClient } from '@sentry/minimal';
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
    options.defaultIntegrations = [
      new coreDefaultIntegrations.InboundFilters(),
      new coreDefaultIntegrations.FunctionToString(),
      new defaultIntegrations.TryCatch(),
      new defaultIntegrations.Breadcrumbs(),
      new defaultIntegrations.GlobalHandlers(),
      new defaultIntegrations.LinkedErrors(),
      new defaultIntegrations.UserAgent(),
    ];
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
