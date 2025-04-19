import '../../scripts/electron-shim.mjs';

import { uuid4 } from '@sentry/core';
import { closeSync, existsSync, openSync, utimesSync, writeFileSync, writeSync } from 'fs';
import { join } from 'path';
import * as tmp from 'tmp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const { createMinidumpLoader } = await import('../../src/main/integrations/sentry-minidump/minidump-loader');

function dumpFileName(): string {
  return `${uuid4()}.dmp`;
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

  test('creates attachment from minidump', () =>
    new Promise<void>((done) => {
      const name = dumpFileName();
      const dumpPath = join(tempDir.name, name);
      writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

      const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

      void loader(false, async (_, attachment) => {
        expect(attachment).to.eql({
          data: VALID_LOOKING_MINIDUMP,
          filename: name,
          attachmentType: 'event.minidump',
        });

        setTimeout(() => {
          expect(existsSync(dumpPath)).to.be.false;
          done();
        }, 1_000);
      });
    }));

  test("doesn't send invalid minidumps", () =>
    new Promise<void>((done) => {
      const missingHeaderDump = join(tempDir.name, dumpFileName());
      writeFileSync(missingHeaderDump, LOOKS_NOTHING_LIKE_A_MINIDUMP);
      const tooSmallDump = join(tempDir.name, dumpFileName());
      writeFileSync(tooSmallDump, MINIDUMP_HEADER_BUT_TOO_SMALL);

      const loader = createMinidumpLoader(() => Promise.resolve([missingHeaderDump, tooSmallDump]));

      let passedAttachment = false;
      void loader(false, async () => {
        passedAttachment = true;
      });

      setTimeout(() => {
        expect(passedAttachment).to.be.false;
        expect(existsSync(missingHeaderDump)).to.be.false;
        expect(existsSync(tooSmallDump)).to.be.false;
        done();
      }, 2_000);
    }));

  test("doesn't send minidumps that are over 30 days old", () =>
    new Promise<void>((done) => {
      const dumpPath = join(tempDir.name, dumpFileName());
      writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
      const thirtyOneDaysAgo = new Date(new Date().getTime() - 31 * 24 * 3_600 * 1_000);
      utimesSync(dumpPath, thirtyOneDaysAgo, thirtyOneDaysAgo);

      const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

      let passedAttachment = false;
      void loader(false, async () => {
        passedAttachment = true;
      });

      setTimeout(() => {
        expect(passedAttachment).to.be.false;
        expect(existsSync(dumpPath)).to.be.false;
        done();
      }, 2_000);
    }));

  test('deletes minidumps when sdk is disabled', () =>
    new Promise<void>((done) => {
      const dumpPath = join(tempDir.name, dumpFileName());
      writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

      const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

      let passedAttachment = false;
      void loader(true, async () => {
        passedAttachment = true;
      });

      setTimeout(() => {
        expect(passedAttachment).to.be.false;
        expect(existsSync(dumpPath)).to.be.false;
        done();
      }, 2_000);
    }));

  test(
    'waits for minidump to stop being modified',
    { timeout: 10_000, repeats: 2 },
    () =>
      new Promise<void>((done) => {
        const dumpPath = join(tempDir.name, dumpFileName());
        const file = openSync(dumpPath, 'w');
        writeSync(file, VALID_LOOKING_MINIDUMP);

        let count = 0;
        // Write the file every 500ms
        const timer = setInterval(() => {
          count += 500;
          writeSync(file, 'X');
        }, 500);

        setTimeout(() => {
          clearInterval(timer);
          closeSync(file);
        }, 4_200);

        const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

        void loader(false, async (_) => {
          expect(count).to.be.greaterThanOrEqual(3_000);
          done();
        });
      }),
  );

  test('sending continues after loading failures', () =>
    new Promise<void>((done) => {
      const missingPath = join(tempDir.name, dumpFileName());
      const name = dumpFileName();
      const dumpPath = join(tempDir.name, name);
      writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

      const loader = createMinidumpLoader(() => Promise.resolve([missingPath, dumpPath]));

      void loader(false, async (_, attachment) => {
        expect(attachment.filename).to.eql(name);

        setTimeout(() => {
          expect(existsSync(dumpPath)).to.be.false;
          done();
        }, 1_000);
      });
    }));
});
