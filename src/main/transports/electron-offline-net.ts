import { BaseTransportOptions, makeOfflineTransport, OfflineTransportOptions, Transport } from '@sentry/core';
import { ElectronNetTransportOptions, makeElectronTransport } from './electron-net';
import { createOfflineStore, OfflineStoreOptions } from './offline-store';

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
