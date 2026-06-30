import '../../scripts/electron-shim.mjs';
import { uuid4 } from '@sentry/core';
import { existsSync, utimesSync, writeFileSync } from 'fs';
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
    // Exclude setImmediate so it can be used to yield to the real I/O event-loop phase
    // between fake-timer advances (setImmediate fires after poll, where fs.stat completes).
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
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
    // Mtime starts at fake-clock "now" so the loader sees it as recently modified
    setMtime(dumpPath, new Date());

    let writeCount = 0;
    const timer = setInterval(() => {
      writeCount++;
      // Keep mtime in sync with the advancing fake clock
      setMtime(dumpPath, new Date());
    }, 500);

    setTimeout(() => clearInterval(timer), 3_000);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let callbackCalled = false;
    const loaderPromise = loader(false, async () => {
      callbackCalled = true;
    });

    // Advance in 500ms steps, yielding to the real I/O event-loop phase (via setImmediate,
    // which fires after poll) between each step so that fs.stat calls in the retry loop
    // complete before the next timer tick. A single advanceTimersByTimeAsync(6000) doesn't
    // work because its internal yield is setTimeout(0), which fires before the I/O poll phase.
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(500);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(callbackCalled).toBe(true);
    expect(writeCount).toBeGreaterThanOrEqual(5);

    await loaderPromise;
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
