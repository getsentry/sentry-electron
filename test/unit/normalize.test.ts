import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import { normalizeUrl } from '../../src/main/normalize';

should();
use(chaiAsPromised);

describe('Normalize URLs', () => {
  it('Example app on Windows', () => {
    const base = 'c:/Users/Username/sentry-electron/example';

    expect(normalizeUrl('C:\\Users\\Username\\sentry-electron\\example\\renderer.js', base)).to.equal(
      'app:///renderer.js',
    );

    expect(normalizeUrl('C:\\Users\\Username\\sentry-electron\\example\\sub-directory\\renderer.js', base)).to.equal(
      'app:///sub-directory/renderer.js',
    );

    expect(normalizeUrl('file:///C:/Users/Username/sentry-electron/example/index.html', base)).to.equal(
      'app:///index.html',
    );
  });

  it('Example app with parentheses', () => {
    const base = 'c:/Users/Username/sentry-electron (beta)/example';

    expect(normalizeUrl('C:\\Users\\Username\\sentry-electron%20(beta)\\example\\renderer.js', base)).to.equal(
      'app:///renderer.js',
    );

    expect(
      normalizeUrl('C:\\Users\\Username\\sentry-electron%20(beta)\\example\\sub-directory\\renderer.js', base),
    ).to.equal('app:///sub-directory/renderer.js');

    expect(normalizeUrl('file:///C:/Users/Username/sentry-electron%20(beta)/example/index.html', base)).to.equal(
      'app:///index.html',
    );
  });

  it('Asar packaged app in Windows Program Files', () => {
    const base = 'C:/Program Files/My App/resources/app.asar';

    expect(normalizeUrl('/C:/Program%20Files/My%20App/resources/app.asar/dist/bundle-app.js', base)).to.equal(
      'app:///dist/bundle-app.js',
    );

    expect(normalizeUrl('file:///C:/Program%20Files/My%20App/resources/app.asar/index.html', base)).to.equal(
      'app:///index.html',
    );

    expect(normalizeUrl('file:///C:/Program%20Files/My%20App/resources/app.asar/a/index.html', base)).to.equal(
      'app:///a/index.html',
    );
  });

  it('Webpack builds', () => {
    const base = '/home/haza/Desktop/foo/app/';
    expect(
      normalizeUrl('/home/haza/Desktop/foo/app/webpack:/electron/src/common/models/ipc-request.ts', base),
    ).to.equal('app:///electron/src/common/models/ipc-request.ts');
  });
});
