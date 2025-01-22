export type {
  Breadcrumb,
  BreadcrumbHint,
  // eslint-disable-next-line deprecation/deprecation
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Session,
} from '@sentry/core';

export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  // eslint-disable-next-line deprecation/deprecation
  addTracingExtensions,
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  BrowserClient,
  browserProfilingIntegration,
  browserTracingIntegration,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  captureSession,
  chromeStackLineParser,
  contextLinesIntegration,
  continueTrace,
  createTransport,
  createUserFeedbackEnvelope,
  // eslint-disable-next-line deprecation/deprecation
  debugIntegration,
  dedupeIntegration,
  defaultRequestInstrumentationOptions,
  endSession,
  eventFromException,
  eventFromMessage,
  exceptionFromError,
  extraErrorDataIntegration,
  feedbackAsyncIntegration,
  feedbackIntegration,
  feedbackSyncIntegration,
  forceLoad,
  functionToStringIntegration,
  getActiveSpan,
  getClient,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getCurrentScope,
  getFeedback,
  getGlobalScope,
  getIsolationScope,
  getReplay,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  globalHandlersIntegration,
  httpClientIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  instrumentOutgoingRequests,
  isInitialized,
  lastEventId,
  linkedErrorsIntegration,
  moduleMetadataIntegration,
  onLoad,
  parameterize,
  registerSpanErrorInstrumentation,
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
  // eslint-disable-next-line deprecation/deprecation
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
  spanToBaggageHeader,
  spanToJSON,
  spanToTraceHeader,
  spotlightBrowserIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
  startNewTrace,
  startSession,
  startSpan,
  startSpanManual,
  suppressTracing,
  thirdPartyErrorFilterIntegration,
  updateSpanName,
  withActiveSpan,
  withIsolationScope,
  withScope,
  zodErrorsIntegration,
  OpenFeatureIntegrationHook,
  browserSessionIntegration,
  buildLaunchDarklyFlagUsedHandler,
  featureFlagsIntegration,
  launchDarklyIntegration,
  openFeatureIntegration,
  unleashIntegration,
} from '@sentry/browser';

export type { BrowserOptions, ReportDialogOptions } from '@sentry/browser';

export { scopeToMainIntegration } from './integrations/scope-to-main';
export { makeRendererTransport } from './transport';
export { init, getDefaultIntegrations } from './sdk';
export { electronRendererStackParser as defaultStackParser } from './stack-parse';
export * from './metrics';
