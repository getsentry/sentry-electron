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
  addIntegration,
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
  startTransaction,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
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
export type { SpanStatusType } from '@sentry/core';

export {
  addTracingExtensions,
  BrowserClient,
  BrowserTracing,
  BrowserProfilingIntegration,
  lastEventId,
  showReportDialog,
  Replay,
} from '@sentry/browser';
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export const Integrations = { ...ElectronRendererIntegrations, ...BrowserIntegrations };
export { init, defaultIntegrations } from './sdk';
