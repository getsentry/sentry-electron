import { makeOfflineTransport, OfflineTransportOptions } from '@sentry/core';
import { BaseTransportOptions, Transport } from '@sentry/types';

import { ElectronNetTransportOptions, makeElectronTransport } from './electron-net';
import { createOfflineStore, OfflineStoreOptions } from './offline-store';

export type ElectronOfflineTransportOptions = ElectronNetTransportOptions &
  OfflineTransportOptions &
  Partial<OfflineStoreOptions>;

/**
 * Creates a Transport that uses Electrons net module to send events to Sentry. When they fail to send they are
 * persisted to disk and sent later
 */
export const makeElectronOfflineTransport = <T extends BaseTransportOptions>(
  options: T & ElectronOfflineTransportOptions,
): Transport => {
  return makeOfflineTransport(makeElectronTransport)({
    flushAtStartup: true,
    ...options,
    createStore: createOfflineStore,
  });
};
