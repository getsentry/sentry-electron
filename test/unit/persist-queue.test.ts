import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import * as tmp from 'tmp';

import { SentryElectronRequest } from '../../src/main/transports/electron-net';
import { PersistedRequestQueue } from '../../src/main/transports/queue';
import { walkSync } from '../e2e/utils';

should();
use(chaiAsPromised);

function expectFilesInDirectory(dir: string, count: number): void {
  const found = Array.from(walkSync(dir)).length;
  expect(found, 'files in directory').to.equal(count);
}

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
    expectFilesInDirectory(tempDir.name, 0);

    await queue.add({ type: 'event', url: '', body: 'just a string' });
    expectFilesInDirectory(tempDir.name, 2);

    // We create a new queue to force reading from serialized store
    const queue2 = new PersistedRequestQueue(tempDir.name);
    const popped = await queue2.pop('http://nothing');
    expect(popped).to.not.be.undefined;
    expect(popped?.date).to.be.instanceOf(Date);
    expect(popped?.body).to.not.be.undefined;
    expect(popped?.url).to.equal('http://nothing');
    expect(popped?.body.toString()).to.equal('just a string');
    expectFilesInDirectory(tempDir.name, 1);
  });

  it('Drops requests when full', async () => {
    const queue = new PersistedRequestQueue(tempDir.name, 30, 5);

    await queue.add({ type: 'event', url: '', body: '1' });
    await queue.add({ type: 'event', url: '', body: '2' });
    await queue.add({ type: 'event', url: '', body: '3' });
    await queue.add({ type: 'event', url: '', body: '4' });
    await queue.add({ type: 'event', url: '', body: '5' });
    await queue.add({ type: 'event', url: '', body: '6' });
    await queue.add({ type: 'event', url: '', body: '7' });
    expectFilesInDirectory(tempDir.name, 6);

    const popped: SentryElectronRequest[] = [];
    let pop: SentryElectronRequest | undefined;
    while ((pop = await queue.pop('http://nothing'))) {
      popped.push(pop);
    }

    expect(popped.length).to.equal(5);
    expect(popped.map((p) => p.body.toString()).join('')).to.equal('12345');
    expectFilesInDirectory(tempDir.name, 1);
  });

  it('Drops old events', async () => {
    const queue = new PersistedRequestQueue(tempDir.name, 1, 5);

    await queue.add({ type: 'event', url: '', body: 'so old 1', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ type: 'event', url: '', body: 'so old 2', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ type: 'event', url: '', body: 'so old 3', date: new Date(Date.now() - 100_000_000) });
    await queue.add({ type: 'event', url: '', body: 'so old 4' });
    expectFilesInDirectory(tempDir.name, 5);

    const pop = await queue.pop('http://nothing');
    expect(pop).to.not.be.undefined;
    const pop2 = await queue.pop('http://nothing');
    expect(pop2).to.be.undefined;
    expectFilesInDirectory(tempDir.name, 1);
  });
});
