import { Integrations as BrowserIntegrations } from '@sentry/browser';

import * as ElectronRendererIntegrations from './integrations';

export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
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
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  Session,
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
} from '@sentry/core';

export { BrowserClient, lastEventId, showReportDialog } from '@sentry/browser';
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export const Integrations = { ...ElectronRendererIntegrations, ...BrowserIntegrations };
export { init, defaultIntegrations } from './sdk';
