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

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.equal(undefined);
    expect(context.testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
    expect(context.testServer.events[0].data.culprit).to.equal('app:///renderer.js');
  });

  it('Crash renderer', async () => {
    try {
      await context.app.client
        .waitForExist('#crash-render')
        .click('#crash-render');
    } catch (e) {
      // The renderer crashes and causes an exception in 'click'
    }

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.be.instanceOf(Buffer);
    expect(context.testServer.events[0].sentry_key).to.equal('37f8a2ee37c0409d8970bc7559c7c7e4');
  });
});
