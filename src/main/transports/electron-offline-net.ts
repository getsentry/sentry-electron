import type { BaseTransportOptions, OfflineTransportOptions, Transport } from '@sentry/core';
import { makeOfflineTransport } from '@sentry/core';
import type { ElectronNetTransportOptions } from './electron-net.js';
import { makeElectronTransport } from './electron-net.js';
import type { OfflineStoreOptions } from './offline-store.js';
import { createOfflineStore } from './offline-store.js';

export type ElectronOfflineTransportOptions = ElectronNetTransportOptions &
  OfflineTransportOptions &
  Partial<OfflineStoreOptions>;

/**
 * Creates a Transport that uses Electrons net module to send events to Sentry. When they fail to send they are
 * persisted to disk and sent later
 */
export function makeElectronOfflineTransport<T extends BaseTransportOptions>(
  baseTransport: (opt: T & ElectronOfflineTransportOptions) => Transport = makeElectronTransport,
): (options: T & ElectronOfflineTransportOptions) => Transport {
  return (userOptions: T & ElectronOfflineTransportOptions): Transport => {
    // `makeElectronOfflineTransport` is a combination of two transports.
    //
    // The base Electron transport (`makeElectronTransport`) is wrapped by `makeOfflineTransport` which stores events to
    // disk when they fail to send.
    return makeOfflineTransport(baseTransport)({
      flushAtStartup: true,
      createStore: createOfflineStore,
      ...userOptions,
    });
  };
}
