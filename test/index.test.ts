import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { APPDATA_DIRECTORY, initialiseSpectron } from './spectron-helper';

should();
const app = initialiseSpectron();

use(chaiAsPromised);

describe('Test', () => {
  before(() => {
    // chaiAsPromised.transferPromiseness = app.transferPromiseness;
    return app.start().then(() => app.client.waitUntilWindowLoaded());
  });

  after(() => {
    if (app && app.isRunning()) {
      return app.stop();
    }
    return false;
  });

  beforeEach(async () => {
    if (process.env[APPDATA_DIRECTORY]) {
      app.electron.app.setPath('userData', process.env[
        APPDATA_DIRECTORY
      ] as string);
    }
    // await Sentry.create(
    //   'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291',
    // )
    //   .use(SentryBrowser)
    //   .install()
    //   .then(client => client.setContext({ extra: { abc: 'def' } }));
  });

  it('open window', () => {
    return app.client.waitUntilWindowLoaded().then(() => {
      return app.client.getWindowCount().should.eventually.equal(1);
    });
  });
});
