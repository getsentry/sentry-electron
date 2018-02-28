import * as Sentry from '@sentry/core';
import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Application } from 'spectron';
import { getTestContext, TestContext } from './spectron-helper';
import { TestServer } from './test-server';

should();
let context: TestContext;
let testServer: TestServer;

use(chaiAsPromised);

describe('Test', () => {
  beforeEach(async () => {
    testServer = new TestServer();
    testServer.start();

    context = await getTestContext();
    await context.start();
  });

  afterEach(async () => {
    context.stop();
    await testServer.stop();
    return false;
  });

  it('Throw renderer error', async () => {
    await context.app.client
      .waitForExist('#error-render')
      .click('#error-render')
      .pause(2000);

    expect(testServer.events.length).to.equal(1);
    expect(testServer.events[0].native).to.equal(false);
    expect(testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
  });

  it('Crash renderer', async () => {
    try {
      await context.app.client
        .waitForExist('#crash-render')
        .click('#crash-render');
    } catch (e) {
      // The renderer crashes and causes an exception
    }

    context.app.client.pause(2000);

    expect(testServer.events.length).to.equal(1);
    expect(testServer.events[0].native).to.equal(true);
    expect(testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
  });
});
