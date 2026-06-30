import '../../scripts/electron-shim.mjs';
import { uuid4 } from '@sentry/core';
import { existsSync, utimesSync, writeFileSync, promises as fsPromises } from 'fs';
import { join } from 'path';
import * as tmp from 'tmp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const { createMinidumpLoader } = await import('../../src/main/integrations/sentry-minidump/minidump-loader');

function dumpFileName(): string {
  return `${uuid4()}.dmp`;
}

function setMtime(path: string, date: Date): void {
  utimesSync(path, date, date);
}

const VALID_LOOKING_MINIDUMP = Buffer.from(`MDMP${'X'.repeat(12_000)}`);
const LOOKS_NOTHING_LIKE_A_MINIDUMP = Buffer.from('X'.repeat(12_000));
const MINIDUMP_HEADER_BUT_TOO_SMALL = Buffer.from('MDMPdflahfalfhalkfnaklsfnalfkn');

describe('createMinidumpLoader', () => {
  let tempDir: tmp.DirResult;

  beforeAll(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
  });

  afterAll(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('creates attachment from minidump', async () => {
    const name = dumpFileName();
    const dumpPath = join(tempDir.name, name);
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    setMtime(dumpPath, new Date(Date.now() - 2_000));

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let attachment: unknown;
    await loader(false, async (_, att) => {
      attachment = att;
    });

    expect(attachment).to.eql({
      data: VALID_LOOKING_MINIDUMP,
      filename: name,
      attachmentType: 'event.minidump',
    });
    expect(existsSync(dumpPath)).to.be.false;
  });

  test("doesn't send invalid minidumps", async () => {
    const missingHeaderDump = join(tempDir.name, dumpFileName());
    writeFileSync(missingHeaderDump, LOOKS_NOTHING_LIKE_A_MINIDUMP);
    setMtime(missingHeaderDump, new Date(Date.now() - 2_000));
    const tooSmallDump = join(tempDir.name, dumpFileName());
    writeFileSync(tooSmallDump, MINIDUMP_HEADER_BUT_TOO_SMALL);
    setMtime(tooSmallDump, new Date(Date.now() - 2_000));

    const loader = createMinidumpLoader(() => Promise.resolve([missingHeaderDump, tooSmallDump]));

    let passedAttachment = false;
    await loader(false, async () => {
      passedAttachment = true;
    });

    expect(passedAttachment).to.be.false;
    expect(existsSync(missingHeaderDump)).to.be.false;
    expect(existsSync(tooSmallDump)).to.be.false;
  });

  test("doesn't send minidumps that are over 30 days old", async () => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    setMtime(dumpPath, new Date(Date.now() - 31 * 24 * 3_600 * 1_000));

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let passedAttachment = false;
    await loader(false, async () => {
      passedAttachment = true;
    });

    expect(passedAttachment).to.be.false;
    expect(existsSync(dumpPath)).to.be.false;
  });

  test('deletes minidumps when sdk is disabled', async () => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    setMtime(dumpPath, new Date(Date.now() - 2_000));

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let passedAttachment = false;
    await loader(true, async () => {
      passedAttachment = true;
    });

    expect(passedAttachment).to.be.false;
    expect(existsSync(dumpPath)).to.be.false;
  });

  test('waits for minidump to stop being modified', async () => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    // Track the mtime the loader will see - starts at "now" (recently modified)
    let fakeMtime = Date.now();

    // Mock fs.promises.stat so the retry loop resolves via microtasks rather than real
    // I/O callbacks. Real I/O callbacks fire in the event-loop poll phase, which
    // vi.advanceTimersByTimeAsync can't guarantee to drain between fake timer fires.
    const statSpy = vi.spyOn(fsPromises, 'stat').mockImplementation(async () => {
      return { mtimeMs: fakeMtime } as any;
    });

    let writeCount = 0;
    const timer = setInterval(() => {
      writeCount++;
      fakeMtime = Date.now(); // keep mtime in sync with advancing fake clock
    }, 500);
    setTimeout(() => clearInterval(timer), 3_000);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let callbackCalled = false;
    const loaderPromise = loader(false, async () => {
      callbackCalled = true;
    });

    // Advance past writes stopping (3000ms) + NOT_MODIFIED_MS (1000ms) + one retry (500ms)
    await vi.advanceTimersByTimeAsync(6_000);
    // After the advance the mtime check passes, but fs.readFile/unlink are real I/O —
    // await the loader promise before asserting so that I/O settles.
    await loaderPromise;

    expect(callbackCalled).toBe(true);
    expect(writeCount).toBeGreaterThanOrEqual(5);
  });

  test('sending continues after loading failures', async () => {
    const missingPath = join(tempDir.name, dumpFileName());
    const name = dumpFileName();
    const dumpPath = join(tempDir.name, name);
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    setMtime(dumpPath, new Date(Date.now() - 2_000));

    const loader = createMinidumpLoader(() => Promise.resolve([missingPath, dumpPath]));

    let receivedName: string | undefined;
    await loader(false, async (_, attachment) => {
      receivedName = attachment.filename;
    });

    expect(receivedName).to.eql(name);
    expect(existsSync(dumpPath)).to.be.false;
  });
});
