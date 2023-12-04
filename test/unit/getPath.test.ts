import { expect } from 'chai';
import { spawnSync } from 'child_process';
import { join } from 'path';

describe('app.getPath', () => {
  it('not called before init', () => {
    const result = spawnSync('yarn', ['start'], { cwd: join(__dirname, 'getPath-test-app') });
    expect(result.status).to.equal(0);
  });
});
