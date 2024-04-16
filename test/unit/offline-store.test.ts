import '../../scripts/electron-shim.mjs';

import { createEventEnvelope } from '@sentry/core';
import { Envelope, Event } from '@sentry/types';
import * as tmp from 'tmp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { delay, expectFilesInDirectory } from '../helpers';

const { createOfflineStore } = await import('../../src/main/transports/offline-store');

function EVENT_ENVELOPE(message: string = 'test', send_at?: Date) {
  const env = createEventEnvelope({ message });
  if (send_at) {
    env[0].sent_at = send_at.toISOString();
  }
  return env;
}

function getMessageFromEventEnvelope(envelope: Envelope | undefined): string | undefined {
  return (envelope?.[1][0][1] as Event).message;
}

describe('createOfflineStore', () => {
  let tempDir: tmp.DirResult;
  beforeEach(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
  });

  afterEach(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  test('Queues and returns a request', async () => {
    const queue = createOfflineStore({ queuePath: tempDir.name });
    await expectFilesInDirectory(tempDir.name, 0);

    await queue.push(EVENT_ENVELOPE());
    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 2);

    // We create a new queue to force reading from serialized store
    const queue2 = createOfflineStore({ queuePath: tempDir.name });
    const popped = await queue2.shift();
    expect(popped).to.not.be.undefined;
    expect(getMessageFromEventEnvelope(popped)).toBe('test');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  test('Drops requests when full', async () => {
    const queue = createOfflineStore({ queuePath: tempDir.name, maxQueueSize: 5 });

    await queue.push(EVENT_ENVELOPE('1'));
    await queue.push(EVENT_ENVELOPE('2'));
    await queue.push(EVENT_ENVELOPE('3'));
    await queue.push(EVENT_ENVELOPE('4'));
    await queue.push(EVENT_ENVELOPE('5'));
    await queue.push(EVENT_ENVELOPE('6'));
    await queue.push(EVENT_ENVELOPE('7'));

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 6);

    const popped: Envelope[] = [];
    let pop: Envelope | undefined;
    while ((pop = await queue.shift())) {
      popped.push(pop);
    }

    expect(popped.length).to.equal(5);
    expect(popped.map(getMessageFromEventEnvelope).join('')).to.equal('12345');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  test('Drops old events', async () => {
    const queue = createOfflineStore({ queuePath: tempDir.name, maxAgeDays: 1, maxQueueSize: 5 });

    await queue.push(EVENT_ENVELOPE('1', new Date(Date.now() - 100_000_000)));
    await queue.push(EVENT_ENVELOPE('2', new Date(Date.now() - 100_000_000)));
    await queue.push(EVENT_ENVELOPE('3', new Date(Date.now() - 100_000_000)));
    await queue.push(EVENT_ENVELOPE('4'));

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 2);

    const pop = await queue.shift();
    expect(pop).toBeDefined();
    const pop2 = await queue.shift();
    expect(pop2).toBeUndefined();

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });
});
