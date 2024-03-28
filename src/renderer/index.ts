export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
  Session,
} from '@sentry/types';

export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  addTracingExtensions,
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  BrowserClient,
  browserProfilingIntegration,
  browserTracingIntegration,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureMessage,
  captureSession,
  captureUserFeedback,
  chromeStackLineParser,
  contextLinesIntegration,
  continueTrace,
  createTransport,
  createUserFeedbackEnvelope,
  debugIntegration,
  dedupeIntegration,
  defaultRequestInstrumentationOptions,
  endSession,
  eventFromException,
  eventFromMessage,
  exceptionFromError,
  extraErrorDataIntegration,
  feedbackIntegration,
  forceLoad,
  functionToStringIntegration,
  getActiveSpan,
  getClient,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getReplay,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  globalHandlersIntegration,
  httpClientIntegration,
  httpContextIntegration,
  Hub,
  inboundFiltersIntegration,
  instrumentOutgoingRequests,
  isInitialized,
  linkedErrorsIntegration,
  moduleMetadataIntegration,
  onLoad,
  parameterize,
  replayCanvasIntegration,
  replayIntegration,
  reportingObserverIntegration,
  rewriteFramesIntegration,
  Scope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  sendFeedback,
  sessionTimingIntegration,
  setContext,
  setCurrentClient,
  setExtra,
  setExtras,
  setHttpStatus,
  setMeasurement,
  setTag,
  setTags,
  setUser,
  showReportDialog,
  spanToJSON,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
  startSession,
  startSpan,
  startSpanManual,
  withActiveSpan,
  withIsolationScope,
  withScope,
} from '@sentry/browser';

export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export { scopeToMainIntegration } from './integrations/scope-to-main';
export { makeRendererTransport } from './transport';
export { init, getDefaultIntegrations } from './sdk';
export { electronRendererStackParser as defaultStackParser } from './stack-parse';
export * from './metrics';
