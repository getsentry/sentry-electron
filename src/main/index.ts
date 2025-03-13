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
  close,
  connectIntegration,
  consoleIntegration,
  contextLinesIntegration,
  continueTrace,
  createGetModuleFromFilename,
  createTransport,
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
  isInitialized,
  kafkaIntegration,
  koaIntegration,
  knexIntegration,
  lastEventId,
  linkedErrorsIntegration,
  localVariablesIntegration,
  lruMemoizerIntegration,
  modulesIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysql2Integration,
  mysqlIntegration,
  nativeNodeFetchIntegration,
  NodeClient,
  nodeContextIntegration,
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
  suppressTracing,
  tediousIntegration,
  trpcMiddleware,
  updateSpanName,
  validateOpenTelemetrySetup,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  zodErrorsIntegration,
} from '@sentry/node';

export type { NodeOptions } from '@sentry/node';

export { electronBreadcrumbsIntegration } from './integrations/electron-breadcrumbs';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { sentryMinidumpIntegration } from './integrations/sentry-minidump';
export { electronMinidumpIntegration } from './integrations/electron-minidump';
export { preloadInjectionIntegration } from './integrations/preload-injection';
export { mainProcessSessionIntegration } from './integrations/main-process-session';
export { browserWindowSessionIntegration } from './integrations/browser-window-session';
export { additionalContextIntegration } from './integrations/additional-context';
export { electronNetIntegration } from './integrations/net-breadcrumbs';
export { childProcessIntegration } from './integrations/child-process';
export { screenshotsIntegration } from './integrations/screenshots';
export { rendererProfileFromIpc } from './integrations/renderer-profiling';
export { normalizePathsIntegration } from './integrations/normalize-paths';
export { electronContextIntegration } from './integrations/electron-context';
export { gpuContextIntegration } from './integrations/gpu-context';
export { anrIntegration } from './integrations/anr';

export { makeElectronTransport } from './transports/electron-net';
export { makeElectronOfflineTransport } from './transports/electron-offline-net';

export type { ElectronMainOptions } from './sdk';
export { init, getDefaultIntegrations } from './sdk';
export { defaultStackParser } from './stack-parse';

export { IPCMode } from '../common/ipc';
