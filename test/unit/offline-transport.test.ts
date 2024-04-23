import '../../scripts/electron-shim.mjs';

import { createEventEnvelope, createTransport, OfflineTransportOptions } from '@sentry/core';
import { Envelope, InternalBaseTransportOptions, TransportMakeRequestResponse } from '@sentry/types';
import { describe, expect, test } from 'vitest';

import { ElectronOfflineTransportOptions } from '../../src/main/transports/electron-offline-net';

const { makeElectronOfflineTransport } = await import('../../src/main/transports/electron-offline-net');

function EVENT_ENVELOPE(message: string = 'test', send_at?: Date) {
  const env = createEventEnvelope({ message });
  if (send_at) {
    env[0].sent_at = send_at.toISOString();
  }
  return env;
}

type MockResult<T> = T | Error;

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
  url: 'http://localhost:8000',
};

const createTestTransport = (...sendResults: MockResult<TransportMakeRequestResponse>[]) => {
  const sentEnvelopes: (string | Uint8Array)[] = [];

  return {
    getSentEnvelopes: () => sentEnvelopes,
    getSendCount: () => sentEnvelopes.length,
    baseTransport: (options: InternalBaseTransportOptions) =>
      createTransport(options, ({ body }) => {
        return new Promise((resolve, reject) => {
          const next = sendResults.shift();

          if (next instanceof Error) {
            reject(next);
          } else {
            sentEnvelopes.push(body);
            resolve(next as TransportMakeRequestResponse);
          }
        });
      }),
  };
};

type StoreEvents = ('push' | 'unshift' | 'shift')[];

interface OfflineStore {
  push(env: Envelope): Promise<void>;
  unshift(env: Envelope): Promise<void>;
  shift(): Promise<Envelope | undefined>;
}

type CreateOfflineStore = (options: OfflineTransportOptions) => OfflineStore;

function createTestStore(...popResults: MockResult<Envelope | undefined>[]): {
  getCalls: () => StoreEvents;
  store: CreateOfflineStore;
} {
  const calls: StoreEvents = [];

  return {
    getCalls: () => calls,
    store: (_: OfflineTransportOptions) => ({
      push: async (env) => {
        if (popResults.length < 30) {
          popResults.push(env);
          calls.push('push');
        }
      },
      unshift: async (env) => {
        if (popResults.length < 30) {
          popResults.unshift(env);
          calls.push('unshift');
        }
      },
      shift: async () => {
        calls.push('shift');
        const next = popResults.shift();

        if (next instanceof Error) {
          throw next;
        }

        return next;
      },
      count: async () => popResults.length,
    }),
  };
}

describe('makeElectronOfflineTransport', () => {
  test('shouldSend allows sending', async () => {
    expect.assertions(3);

    const { baseTransport, getSendCount } = createTestTransport({ statusCode: 200 });
    const { store: createStore, getCalls } = createTestStore();

    let shouldSendCalled = 0;

    const options: ElectronOfflineTransportOptions = {
      ...transportOptions,
      createStore,
      shouldSend: () => {
        shouldSendCalled++;
        return true;
      },
    };

    const transport = makeElectronOfflineTransport(baseTransport)(options);

    await transport.send(EVENT_ENVELOPE('msg'));

    expect(shouldSendCalled).toBe(1);
    expect(getSendCount()).toBe(1);
    expect(getCalls()).toEqual([]);
  });

  test('shouldSend stops sending and queues', async () => {
    expect.assertions(3);

    const { baseTransport, getSendCount } = createTestTransport({ statusCode: 200 });
    const { store: createStore, getCalls } = createTestStore();

    let shouldSendCalled = 0;

    const options: ElectronOfflineTransportOptions = {
      ...transportOptions,
      createStore,
      shouldSend: () => {
        shouldSendCalled++;
        return false;
      },
    };

    const transport = makeElectronOfflineTransport(baseTransport)(options);

    await transport.send(EVENT_ENVELOPE('msg'));

    expect(shouldSendCalled).toBe(1);
    expect(getSendCount()).toBe(0);
    expect(getCalls()).toEqual(['push']);
  });
});
