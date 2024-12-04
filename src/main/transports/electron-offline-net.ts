import { BaseTransportOptions, Envelope, makeOfflineTransport, OfflineTransportOptions, Transport } from '@sentry/core';

import { ElectronNetTransportOptions, makeElectronTransport } from './electron-net';
import { createOfflineStore, OfflineStoreOptions } from './offline-store';

export type ElectronOfflineTransportOptions = ElectronNetTransportOptions &
  OfflineTransportOptions &
  Partial<OfflineStoreOptions> & {
    /**
     * Should we attempt to send the envelope to Sentry.
     * If this function returns false, `shouldStore` will be called to determine if the envelope should be stored.
     *
     * Default: () => true
     *
     * @param envelope The envelope that will be sent.
     * @returns Whether we should attempt to send the envelope
     */
    shouldSend?: (envelope: Envelope) => boolean | Promise<boolean>;
  };

// Transport that throws if the `shouldSend` callback returns false
function makeShouldSendTransport<T extends BaseTransportOptions>(
  baseTransport: (opt: T & ElectronOfflineTransportOptions) => Transport,
): (options: T & ElectronOfflineTransportOptions) => Transport {
  return (options: T & ElectronOfflineTransportOptions) => {
    const transport = baseTransport(options);

    return {
      ...transport,
      send: async (envelope) => {
        const shouldAttemptSend = options.shouldSend === undefined || (await options.shouldSend(envelope));

        if (shouldAttemptSend) {
          return transport.send(envelope);
        }

        throw new Error("'shouldSend' callback returned false. Skipped sending.");
      },
    };
  };
}

/**
 * Creates a Transport that uses Electrons net module to send events to Sentry. When they fail to send they are
 * persisted to disk and sent later
 */
export function makeElectronOfflineTransport<T extends BaseTransportOptions>(
  baseTransport: (opt: T & ElectronOfflineTransportOptions) => Transport = makeElectronTransport,
): (options: T & ElectronOfflineTransportOptions) => Transport {
  return (userOptions: T & ElectronOfflineTransportOptions): Transport => {
    // `makeElectronOfflineTransport` is a combination of three transports.
    //
    // The base Electron transport (`makeElectronTransport`) is first wrapped by `makeShouldSendTransport` which skips
    // sending events and throws when the `shouldSend` callback returns false.
    //
    // This is then wrapped again by `makeOfflineTransport` which stores events to disk when they fail to send.
    return makeOfflineTransport(makeShouldSendTransport(baseTransport))({
      flushAtStartup: true,
      createStore: createOfflineStore,
      ...userOptions,
    });
  };
}
