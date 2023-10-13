import { ensureProcess } from '../common';
ensureProcess('main');

import { Integrations as NodeIntegrations } from '@sentry/node';

import * as ElectronMainIntegrations from './integrations';

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

export type { NodeOptions } from '@sentry/node';
export { flush, close, NodeClient, lastEventId } from '@sentry/node';

export { makeElectronTransport } from './transports/electron-net';
export { makeElectronOfflineTransport } from './transports/electron-offline-net';
export const Integrations = { ...ElectronMainIntegrations, ...NodeIntegrations };

export type { ElectronMainOptions } from './sdk';
export { init, defaultIntegrations } from './sdk';
export { IPCMode } from '../common';
export { enableMainProcessAnrDetection } from './anr';
