import * as Sentry from '@sentry/core';
import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { initialiseSpectron } from './spectron-helper';

should();
const app = initialiseSpectron();

use(chaiAsPromised);

describe('Test', () => {
  beforeEach(async () => {
    await app.start();
    await app.client.waitUntilWindowLoaded();
  });

  afterEach(async () => {
    if (app && app.isRunning()) {
      return app.stop();
    }
    return false;
  });

  it('Open app', () => {
    return app.client.getWindowCount().should.eventually.equal(1);
  });

  it('Throw renderer error', done => {
    app.client
      .waitForExist('#error-render')
      .element('#error-render')
      .click()
      .then(() => {
        setTimeout(() => {
          done();
        }, 3000);
      });
  });
});
