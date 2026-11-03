import { promises as fs } from 'fs';
import { join } from 'path';
import * as tmp from 'tmp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BufferedWriteStore, Store } from '../../src/main/store';
import { delay, expectFilesInDirectory } from '../helpers';

interface TestType {
  num: number;
  str: string;
}

describe('Store', () => {
  let tempDir: tmp.DirResult;
  beforeEach(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
  });

  afterEach(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  test('Non throttled store', async () => {
    const store = new Store<TestType | undefined>(tempDir.name, 'test-store', undefined);
    await expectFilesInDirectory(tempDir.name, 0);

    await store.set({ num: 99, str: 'just a string' });
    // It should have been written immediately
    await expectFilesInDirectory(tempDir.name, 1);
    const contents = await fs.readFile(join(tempDir.name, 'test-store.json'), 'utf-8');

    expect(contents).to.equal('{"num":99,"str":"just a string"}');

    // Load a new store instance so it's forced to read from disk
    const store2 = new Store<TestType | undefined>(tempDir.name, 'test-store', undefined);
    const value = await store2.get();

    expect(value).to.eql({ num: 99, str: 'just a string' });

    await store2.clear();
    // File should now be deleted
    await expectFilesInDirectory(tempDir.name, 0);
  });

  test('setSync is not overwritten by in-flight async writes', async () => {
    const store = new Store<TestType | undefined>(tempDir.name, 'test-store', undefined);
    const path = join(tempDir.name, 'test-store.json');

    const pending = [store.set({ num: 1, str: 'async' }), store.set({ num: 2, str: 'async' })];
    store.setSync({ num: 3, str: 'sync' });
    await Promise.all(pending);

    expect(await fs.readFile(path, 'utf-8')).to.equal('{"num":3,"str":"sync"}');
    expect(await store.get()).to.eql({ num: 3, str: 'sync' });

    // Writes made after setSync still apply
    await store.clear();
    await expectFilesInDirectory(tempDir.name, 0);
  });

  test('Throttled store', async () => {
    const store = new BufferedWriteStore<TestType | undefined>(tempDir.name, 'test-store', undefined);
    await expectFilesInDirectory(tempDir.name, 0);

    await store.set({ num: 990, str: 'just a string' });
    // File should not be written after 100ms!
    await delay(100);
    await expectFilesInDirectory(tempDir.name, 0);
    // Should have been written after 1 more second
    await delay(1_000);
    await expectFilesInDirectory(tempDir.name, 1);

    const contents = await fs.readFile(join(tempDir.name, 'test-store.json'), 'utf-8');
    expect(contents).to.equal('{"num":990,"str":"just a string"}');

    await store.set({ num: 5_000, str: 'just a string' });
    await delay(100);

    // File should still contain the old value
    const contents2 = await fs.readFile(join(tempDir.name, 'test-store.json'), 'utf-8');
    expect(contents2).to.equal('{"num":990,"str":"just a string"}');

    await delay(1_000);
    // File should now contain updated value
    const contents3 = await fs.readFile(join(tempDir.name, 'test-store.json'), 'utf-8');
    expect(contents3).to.equal('{"num":5000,"str":"just a string"}');

    // Load a new store instance so it's forced to read from disk
    const store2 = new BufferedWriteStore<TestType | undefined>(tempDir.name, 'test-store', undefined);
    const value = await store2.get();

    expect(value).to.eql({ num: 5_000, str: 'just a string' });

    await store2.clear();
    await delay(1_000);
    // File should now be deleted
    await expectFilesInDirectory(tempDir.name, 0);
  });
});
