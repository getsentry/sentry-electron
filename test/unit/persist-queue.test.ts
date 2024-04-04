import * as tmp from 'tmp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { PersistedRequestQueue, QueuedTransportRequest } from '../../src/main/transports/queue';
import { delay, expectFilesInDirectory } from '../helpers';

describe('PersistedRequestQueue', () => {
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
    const queue = new PersistedRequestQueue(tempDir.name);
    await expectFilesInDirectory(tempDir.name, 0);

    await queue.add({ body: 'just a string' });
    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 2);

    // We create a new queue to force reading from serialized store
    const queue2 = new PersistedRequestQueue(tempDir.name);
    const popped = await queue2.pop();
    expect(popped).to.not.be.undefined;
    expect(popped?.request?.date).to.be.instanceOf(Date);
    expect(popped?.request?.body).to.not.be.undefined;
    expect(popped?.request?.body.toString()).to.equal('just a string');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  test('Correctly returns pending request count', async () => {
    const queue = new PersistedRequestQueue(tempDir.name);

    const r1 = await queue.add({ body: 'just a string' });
    expect(r1).to.equal(1);
    const r2 = await queue.add({ body: 'just another string' });
    expect(r2).to.equal(2);

    const r3 = await queue.pop();
    expect(r3?.pendingCount).to.equal(1);

    const r4 = await queue.pop();
    expect(r4?.pendingCount).to.equal(0);
  });

  test('Drops requests when full', async () => {
    const queue = new PersistedRequestQueue(tempDir.name, 30, 5);

    await queue.add({ body: '1' });
    await queue.add({ body: '2' });
    await queue.add({ body: '3' });
    await queue.add({ body: '4' });
    await queue.add({ body: '5' });
    await queue.add({ body: '6' });
    await queue.add({ body: '7' });

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 6);

    const popped: QueuedTransportRequest[] = [];
    let pop: { request: QueuedTransportRequest } | undefined;
    while ((pop = await queue.pop())) {
      popped.push(pop.request);
    }

    expect(popped.length).to.equal(5);
    expect(popped.map((p) => p.body.toString()).join('')).to.equal('34567');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  test('Drops old events', async () => {
    const queue = new PersistedRequestQueue(tempDir.name, 1, 5);

    await queue.add({ body: 'so old 1', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ body: 'so old 2', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ body: 'so old 3', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ body: 'so old 4' });

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 5);

    const pop = await queue.pop();
    expect(pop).to.not.be.undefined;
    const pop2 = await queue.pop();
    expect(pop2).to.be.undefined;

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });
});
