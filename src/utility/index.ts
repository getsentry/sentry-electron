export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Span,
} from '@sentry/core';

export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  amqplibIntegration,
  captureCheckIn,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  captureSession,
  childProcessIntegration,
  close,
  connectIntegration,
  consoleIntegration,
  consoleLoggingIntegration,
  contextLinesIntegration,
  continueTrace,
  createGetModuleFromFilename,
  createTransport,
  createSentryWinstonTransport,
  cron,
  dataloaderIntegration,
  dedupeIntegration,
  disableAnrDetectionForCallback,
  endSession,
  eventFiltersIntegration,
  expressErrorHandler,
  expressIntegration,
  extraErrorDataIntegration,
  fastifyIntegration,
  featureFlagsIntegration,
  flush,
  fsIntegration,
  functionToStringIntegration,
  generateInstrumentOnce,
  genericPoolIntegration,
  getActiveSpan,
  getAutoPerformanceIntegrations,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  getTraceData,
  getTraceMetaTags,
  graphqlIntegration,
  hapiIntegration,
  httpIntegration,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  initOpenTelemetry,
  instrumentSupabaseClient,
  isEnabled,
  isInitialized,
  kafkaIntegration,
  koaIntegration,
  knexIntegration,
  lastEventId,
  linkedErrorsIntegration,
  localVariablesIntegration,
  logger,
  lruMemoizerIntegration,
  modulesIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysql2Integration,
  mysqlIntegration,
  nativeNodeFetchIntegration,
  NodeClient,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  parameterize,
  postgresIntegration,
  prismaIntegration,
  profiler,
  redisIntegration,
  requestDataIntegration,
  rewriteFramesIntegration,
  Scope,
  SentryContextManager,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setContext,
  setCurrentClient,
  setExtra,
  setExtras,
  setHttpStatus,
  setMeasurement,
  setNodeAsyncContextStrategy,
  setTag,
  setTags,
  setupConnectErrorHandler,
  setupExpressErrorHandler,
  setupFastifyErrorHandler,
  setupHapiErrorHandler,
  setupKoaErrorHandler,
  setUser,
  spanToBaggageHeader,
  spanToJSON,
  spanToTraceHeader,
  spotlightIntegration,
  startInactiveSpan,
  startNewTrace,
  startSession,
  startSpan,
  startSpanManual,
  supabaseIntegration,
  suppressTracing,
  tediousIntegration,
  trpcMiddleware,
  updateSpanName,
  validateOpenTelemetrySetup,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  wrapMcpServerWithSentry,
  zodErrorsIntegration,
} from '@sentry/node';

export type { NodeOptions } from '@sentry/node';

export { makeUtilityProcessTransport } from './transport';

export { init, getDefaultIntegrations, defaultStackParser } from './sdk';
