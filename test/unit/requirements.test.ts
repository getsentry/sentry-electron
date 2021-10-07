import { expect } from 'chai';
import * as fs from 'fs';

describe('TS -> JS conversion check', () => {
  // We should make sure we always use electron.net module since it deals with all possible
  // proxy settings and certificates in different environments
  it('Uses electron.net module', () => {
    const content = fs.readFileSync('main/transports/electron-net.js');
    expect(content.toString()).to.match(/net.request\(/);
  });
});
