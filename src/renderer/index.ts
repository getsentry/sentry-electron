import { Integrations as BrowserIntegrations } from '@sentry/browser';

import * as ElectronRendererIntegrations from './integrations';

export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  EventStatus,
  Exception,
  Response,
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

export { BrowserClient, injectReportDialog, lastEventId, showReportDialog } from '@sentry/browser';
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export const Integrations = { ...ElectronRendererIntegrations, ...BrowserIntegrations };
export { init, defaultIntegrations } from './sdk';
