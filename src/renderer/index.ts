import { Integrations as BrowserIntegrations } from '@sentry/browser';

import * as ElectronRendererIntegrations from './integrations';

export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  // eslint-disable-next-line deprecation/deprecation
  Severity,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
} from '@sentry/types';

export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  getHubFromCarrier,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  runWithAsyncContext,
  Scope,
  // eslint-disable-next-line deprecation/deprecation
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  // eslint-disable-next-line deprecation/deprecation
  spanStatusfromHttpCode,
  // eslint-disable-next-line deprecation/deprecation
  trace,
  withScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  // eslint-disable-next-line deprecation/deprecation
  ModuleMetadata,
  moduleMetadataIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  parameterize,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';

export { scopeToMainIntegration } from './integrations/scope-to-main';
export { metricsAggregatorIntegration } from './integrations/metrics-aggregator';

import { metrics as coreMetrics } from '@sentry/core';

import { MetricsAggregator } from './integrations/metrics-aggregator';

export const metrics = {
  ...coreMetrics,
  // Override the default browser metrics aggregator with the Electron renderer one
  MetricsAggregator,
};

export {
  addTracingExtensions,
  BrowserClient,
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing,
  // eslint-disable-next-line deprecation/deprecation
  BrowserProfilingIntegration,
  // eslint-disable-next-line deprecation/deprecation
  lastEventId,
  showReportDialog,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  replayIntegration,
  replayCanvasIntegration,
  feedbackIntegration,
  sendFeedback,
  breadcrumbsIntegration,
  dedupeIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
  browserApiErrorsIntegration,
  browserTracingIntegration,
  browserProfilingIntegration,
} from '@sentry/browser';
// eslint-disable-next-line deprecation/deprecation
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

/**
 * @deprecated All integrations are now exported from the root of the package.
 */
// eslint-disable-next-line deprecation/deprecation
export const Integrations = { ...BrowserIntegrations, ...ElectronRendererIntegrations };
export { init, defaultIntegrations } from './sdk';
