import { Integrations as BrowserIntegrations } from '@sentry/browser';

import * as ElectronRendererIntegrations from './integrations';

export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
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
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/core';

export {
  BrowserOptions,
  BrowserClient,
  injectReportDialog,
  ReportDialogOptions,
  lastEventId,
  showReportDialog,
} from '@sentry/browser';

export const Integrations = { ...ElectronRendererIntegrations, ...BrowserIntegrations };
export { init, defaultIntegrations } from './sdk';
