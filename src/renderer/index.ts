import * as logger from './log';

export { logger };

export type {
  Breadcrumb,
  BreadcrumbHint,
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
  consoleLoggingIntegration,
  contextLinesIntegration,
  continueTrace,
  createTransport,
  createUserFeedbackEnvelope,
  dedupeIntegration,
  defaultRequestInstrumentationOptions,
  endSession,
  eventFiltersIntegration,
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
  getCurrentScope,
  getFeedback,
  getGlobalScope,
  getIsolationScope,
  getReplay,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  getTraceData,
  globalHandlersIntegration,
  graphqlClientIntegration,
  httpClientIntegration,
  httpContextIntegration,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  instrumentOutgoingRequests,
  instrumentSupabaseClient,
  isEnabled,
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
  statsigIntegration,
  supabaseIntegration,
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
