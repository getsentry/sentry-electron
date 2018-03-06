import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { TestContext } from './test-context';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

should();
use(chaiAsPromised);

describe('Basic Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.start();
  });

  afterEach(async () => {
    await context.stop();
  });

  it('JavaScript exception in renderer process', async () => {
    await context.clickButton('#error-render');
    await context.waitForTrue(() => context.testServer.events.length >= 1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('JavaScript exception in main process', async () => {
    await context.clickButton('#error-main');
    await context.waitForTrue(() => context.testServer.events.length >= 1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('Native crash in renderer process', async () => {
    await context.clickButton('#crash-render');
    await context.waitForTrue(() => context.testServer.events.length >= 1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.be.instanceOf(Buffer);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('Native crash in main process', async () => {
    await context.clickButton('#crash-main');

    // We have to restart the app to send native crashes from the main process
    await context.stop(false);
    await context.start();

    await context.waitForTrue(() => context.testServer.events.length >= 1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.be.instanceOf(Buffer);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });
});
