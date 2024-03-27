import { ensureProcess } from '../common/process';
ensureProcess('main');

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
  parameterize,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';

export { electronBreadcrumbsIntegration } from './integrations/electron-breadcrumbs';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { mainContextIntegration } from './integrations/main-context';
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
export { anrIntegration } from './integrations/anr';

export type { NodeOptions } from '@sentry/node';
export { flush, close, NodeClient, metrics } from '@sentry/node';

export { makeElectronTransport } from './transports/electron-net';
export { makeElectronOfflineTransport } from './transports/electron-offline-net';

export type { ElectronMainOptions } from './sdk';
export { init, getDefaultIntegrations } from './sdk';
export { IPCMode } from '../common/ipc';
