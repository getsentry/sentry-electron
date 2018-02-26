import * as Sentry from '@sentry/core';
import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { APPDATA_DIRECTORY, initialiseSpectron } from './spectron-helper';

should();
const app = initialiseSpectron();

use(chaiAsPromised);

describe('Test', () => {
  before(() => {
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
  });

  it('Open app', () => {
    return app.client.getWindowCount().should.eventually.equal(1);
  });

  it('Throw renderer error', done => {
    app.client
      .element('#error-render')
      .click()
      .then(() => {
        setTimeout(() => {
          done();
        }, 3000);
      });
  });
});
