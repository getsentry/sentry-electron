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
  EventStatus,
  Exception,
  Response,
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
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/core';

export type { NodeOptions } from '@sentry/node';
export { flush, close, NodeClient, lastEventId } from '@sentry/node';

export { ElectronNetTransport } from './transports/electron-net';
export { ElectronOfflineNetTransport } from './transports/electron-offline-net';
export const Integrations = { ...ElectronMainIntegrations, ...NodeIntegrations };

export type { ElectronMainOptions } from './sdk';
export { init, defaultIntegrations } from './sdk';
export { IPCMode } from '../common';
