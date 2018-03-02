import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { TestContext } from './test-context';
import { TestServer } from './test-server';

should();
let context: TestContext;

use(chaiAsPromised);

describe('Basic Tests', () => {
  beforeEach(async () => {
    context = new TestContext();
    await context.start();
  });

  afterEach(async () => {
    await context.stop();
  });

  it('JavaScript exception in renderer process', async () => {
    await context.clickCrashButton('#error-render');

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.equal(undefined);
    expect(context.testServer.events[0].sentry_key).to.equal(
      '37f8a2ee37c0409d8970bc7559c7c7e4',
    );
    expect(context.testServer.events[0].data.culprit).to.equal(
      'app:///renderer.js',
    );
    expect(context.testServer.events[0].data.breadcrumbs.length).to.greaterThan(
      5,
    );
  });

  it('JavaScript exception in main process', async () => {
    await context.clickCrashButton('#error-main');

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.equal(undefined);
    expect(context.testServer.events[0].sentry_key).to.equal(
      '37f8a2ee37c0409d8970bc7559c7c7e4',
    );
    expect(context.testServer.events[0].data.culprit).to.equal(
      'main at EventEmitter.ipcMain.on',
    );
    expect(context.testServer.events[0].data.breadcrumbs.length).to.greaterThan(
      5,
    );
  });

  it('Native crash in renderer process', async () => {
    await context.clickCrashButton('#crash-render');

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.be.instanceOf(Buffer);
    expect(context.testServer.events[0].sentry_key).to.equal(
      '37f8a2ee37c0409d8970bc7559c7c7e4',
    );
    expect(context.testServer.events[0].data.breadcrumbs.length).to.greaterThan(
      5,
    );
  });

  it('Native crash in main process', async () => {
    await context.clickCrashButton('#crash-main');

    // We have to restart the app to send native crashes from the main process
    await context.stop();
    await context.start();

    await context.waitForTrue(() => context.testServer.events.length >= 1);

    expect(context.testServer.events.length).to.equal(1);
    expect(context.testServer.events[0].dump_file).to.be.instanceOf(Buffer);
    expect(context.testServer.events[0].sentry_key).to.equal(
      '37f8a2ee37c0409d8970bc7559c7c7e4',
    );
    expect(context.testServer.events[0].data.breadcrumbs.length).to.greaterThan(
      5,
    );
  });
});
