import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import * as tmp from 'tmp';

import { PersistedRequestQueue, QueuedTransportRequest } from '../../src/main/transports/queue';
import { delay, expectFilesInDirectory } from '../helpers';

should();
use(chaiAsPromised);

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

  it('Queues and returns a request', async () => {
    const queue = new PersistedRequestQueue(tempDir.name);
    await expectFilesInDirectory(tempDir.name, 0);

    await queue.add({ body: 'just a string' });
    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 2);

    // We create a new queue to force reading from serialized store
    const queue2 = new PersistedRequestQueue(tempDir.name);
    const popped = await queue2.pop();
    expect(popped).to.not.be.undefined;
    expect(popped?.date).to.be.instanceOf(Date);
    expect(popped?.body).to.not.be.undefined;
    expect(popped?.body.toString()).to.equal('just a string');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  it('Drops requests when full', async () => {
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
    let pop: QueuedTransportRequest | undefined;
    while ((pop = await queue.pop())) {
      popped.push(pop);
    }

    expect(popped.length).to.equal(5);
    expect(popped.map((p) => p.body.toString()).join('')).to.equal('34567');

    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);
  });

  it('Drops old events', async () => {
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
