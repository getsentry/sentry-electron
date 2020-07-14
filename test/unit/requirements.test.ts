import { expect } from 'chai';
import { exec } from 'child_process';
import * as fs from 'fs';

describe('TS -> JS conversion check', () => {
  // We should make sure we always use electron.net module since it deals with all possible
  // proxy settings and certificates in different environments
  it('Uses electron.net module', () => {
    const content = fs.readFileSync('dist/main/transports/net.js');
    expect(content.toString()).to.match(/net.request\(/);
  });
});

(process.platform === 'linux' ? describe : describe.skip)('Bundle with webpack', () => {
  it('should not throw TypeError: mod.require is not a function', done => {
    exec('cd test/integration/bundle-test-app/; yarn && yarn build && yarn start', (_err, stdout) => {
      expect(stdout).to.not.match(/TypeError: mod\.require is not a function/);
      done();
    });
  });
});
