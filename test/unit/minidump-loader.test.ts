import { uuid4 } from '@sentry/utils';
import { expect } from 'chai';
import { existsSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as tmp from 'tmp';

import { createMinidumpLoader } from '../../src/main/integrations/sentry-minidump/minidump-loader';

function dumpFileName(): string {
  return `${uuid4()}.dmp`;
}

const VALID_LOOKING_MINIDUMP = Buffer.from(`MDMP${'x'.repeat(12_000)}`);
const LOOKS_NOTHING_LIKE_A_MINIDUMP = Buffer.from('X'.repeat(12_000));
const MINIDUMP_HEADER_BUT_TOO_SMALL = Buffer.from('MDMPdflahfalfhalkfnaklsfnalfkn');

describe('createMinidumpLoader', () => {
  let tempDir: tmp.DirResult;
  before(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
  });

  after(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  it('creates attachment from minidump', (done) => {
    const name = dumpFileName();
    const dumpPath = join(tempDir.name, name);
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    void loader(false, (attachment) => {
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
  });

  it("doesn't send invalid minidumps", (done) => {
    const missingHeaderDump = join(tempDir.name, dumpFileName());
    writeFileSync(missingHeaderDump, LOOKS_NOTHING_LIKE_A_MINIDUMP);
    const tooSmallDump = join(tempDir.name, dumpFileName());
    writeFileSync(tooSmallDump, MINIDUMP_HEADER_BUT_TOO_SMALL);

    const loader = createMinidumpLoader(() => Promise.resolve([missingHeaderDump, tooSmallDump]));

    let passedAttachment = false;
    void loader(false, () => {
      passedAttachment = true;
    });

    setTimeout(() => {
      expect(passedAttachment).to.be.false;
      expect(existsSync(missingHeaderDump)).to.be.false;
      expect(existsSync(tooSmallDump)).to.be.false;
      done();
    }, 2_000);
  });

  it("doesn't send minidumps that are over 30 days old", (done) => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    const now = new Date().getTime() / 1000;
    const thirtyOneDaysAgo = now - 31 * 24 * 3_600;
    utimesSync(dumpPath, thirtyOneDaysAgo, thirtyOneDaysAgo);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let passedAttachment = false;
    void loader(false, () => {
      passedAttachment = true;
    });

    setTimeout(() => {
      expect(passedAttachment).to.be.false;
      expect(existsSync(dumpPath)).to.be.false;
      done();
    }, 2_000);
  });

  it('deletes minidumps when sdk is disabled', (done) => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let passedAttachment = false;
    void loader(true, () => {
      passedAttachment = true;
    });

    setTimeout(() => {
      expect(passedAttachment).to.be.false;
      expect(existsSync(dumpPath)).to.be.false;
      done();
    }, 2_000);
  });

  it('waits for minidump to stop being modified', (done) => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    let count = 0;
    // Write the file every 500ms
    const timer = setInterval(() => {
      count += 500;
      writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);
    }, 500);

    // Stop writing after 3 seconds
    setTimeout(() => {
      clearInterval(timer);
    }, 3_200);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    void loader(false, (_) => {
      expect(count).to.be.greaterThanOrEqual(3_000);
      done();
    });
  });

  it('sending continues after loading failures', (done) => {
    const missingPath = join(tempDir.name, dumpFileName());
    const name = dumpFileName();
    const dumpPath = join(tempDir.name, name);
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    const loader = createMinidumpLoader(() => Promise.resolve([missingPath, dumpPath]));

    void loader(false, (attachment) => {
      expect(attachment.filename).to.eql(name);

      setTimeout(() => {
        expect(existsSync(dumpPath)).to.be.false;
        done();
      }, 1_000);
    });
  });
});
