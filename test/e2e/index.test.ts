import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { TestContext } from './test-context';
import { TestServer } from './test-server';

should();
let context: TestContext;

use(chaiAsPromised);

describe('Test', () => {
  beforeEach(async () => {
    context = new TestContext();
    await context.start();
  });

  afterEach(async () => {
    await context.stop();
  });

  it('Throw renderer error', async () => {
    await context.app.client
      .waitForExist('#error-render')
      .click('#error-render');

    await context.waitForTrue(() => context.testServer.events.length === 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].native).to.equal(false);
    expect(context.testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
  });

  it('Crash renderer', async () => {
    try {
      await context.app.client
        .waitForExist('#crash-render')
        .click('#crash-render');
    } catch (e) {
      // The renderer crashes and causes an exception
    }

    await context.waitForTrue(() => context.testServer.events.length === 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].native).to.equal(true);
    expect(context.testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
  });
});
