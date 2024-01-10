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
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
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
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';

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
  BrowserTracing,
  BrowserProfilingIntegration,
  // eslint-disable-next-line deprecation/deprecation
  lastEventId,
  showReportDialog,
  Replay,
} from '@sentry/browser';
// eslint-disable-next-line deprecation/deprecation
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export const Integrations = { ...BrowserIntegrations, ...ElectronRendererIntegrations };
export { init, defaultIntegrations } from './sdk';
