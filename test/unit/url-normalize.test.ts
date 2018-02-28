import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { SentryElectron } from '../../src/lib/electron';

should();
use(chaiAsPromised);

// It's not public
const normalizeUrl = (SentryElectron as any).normalizeUrl as (url: string, base: string) => string;

describe('Normalize URLs', () => {
  it('Example app on Windows', () => {
    const base = 'c:/Users/Username/sentry-electron/example';

    expect(normalizeUrl('C:\\Users\\Username\\sentry-electron\\example\\renderer.js', base))
      .to.equal('app:///renderer.js');

    expect(normalizeUrl('C:\\Users\\Username\\sentry-electron\\example\\sub-directory\\renderer.js', base))
      .to.equal('app:///sub-directory/renderer.js');

    expect(normalizeUrl('file:///C:/Users/Username/sentry-electron/example/index.html', base))
      .to.equal('app:///index.html');
  });

  it('Asar packaged app in Windows Program Files', () => {
    const base = 'C:/Program Files/My App/resources/app.asar';

    expect(normalizeUrl('/C:/Program%20Files/My%20App/resources/app.asar/dist/bundle-app.js', base))
      .to.equal('app:///dist/bundle-app.js');

    expect(normalizeUrl('file:///C:/Program%20Files/My%20App/resources/app.asar/index.html', base))
      .to.equal('app:///index.html');

    expect(normalizeUrl('file:///C:/Program%20Files/My%20App/resources/app.asar/a/index.html', base))
      .to.equal('app:///a/index.html');
  });
});
