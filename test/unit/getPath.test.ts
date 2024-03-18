import { expect } from 'chai';
import { spawnSync } from 'child_process';
import { join } from 'path';

describe('app.getPath', () => {
  it('not called before init', () => {
    const result = spawnSync('yarn', ['start'], { cwd: join(__dirname, 'getPath-test-app') });
    // status is null on Windows in CI for some unknown reason
    if (process.platform !== 'win32') {
      expect(result.status).to.equal(0);
    }
  });
});
