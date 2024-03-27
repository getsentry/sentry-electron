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
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
} from '@sentry/types';

export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  moduleMetadataIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  parameterize,
} from '@sentry/core';

export { scopeToMainIntegration } from './integrations/scope-to-main';

export * from './metrics';

export {
  addTracingExtensions,
  BrowserClient,
  showReportDialog,
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
  captureConsoleIntegration,
} from '@sentry/browser';
// eslint-disable-next-line deprecation/deprecation
export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export { init, getDefaultIntegrations } from './sdk';
