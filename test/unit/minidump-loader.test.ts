import { uuid4 } from '@sentry/utils';
import { expect } from 'chai';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as tmp from 'tmp';

import { createMinidumpLoader } from '../../src/main/integrations/sentry-minidump/minidump-loader';

function dumpFileName(): string {
  return `${uuid4()}.dmp`;
}

const VALID_LOOKING_MINIDUMP = Buffer.from(`MDMP${'x'.repeat(12_000)}`);
const LOOKS_NOTHING_LIKE_A_MINIDUMP = Buffer.from('X'.repeat(12_000));

describe('createMinidumpLoader', () => {
  let tempDir: tmp.DirResult;
  beforeEach(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
  });

  afterEach(() => {
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
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, LOOKS_NOTHING_LIKE_A_MINIDUMP);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let returnedAttachment = false;
    void loader(false, () => {
      returnedAttachment = true;
    });

    setTimeout(() => {
      expect(returnedAttachment).to.be.false;
      expect(existsSync(dumpPath)).to.be.false;
      done();
    }, 2_000);
  });

  it('deletes minidumps when instructed', (done) => {
    const dumpPath = join(tempDir.name, dumpFileName());
    writeFileSync(dumpPath, VALID_LOOKING_MINIDUMP);

    const loader = createMinidumpLoader(() => Promise.resolve([dumpPath]));

    let returnedAttachment = false;
    void loader(true, () => {
      returnedAttachment = true;
    });

    setTimeout(() => {
      expect(returnedAttachment).to.be.false;
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
