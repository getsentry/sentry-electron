import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { TestContext } from './context';
import { getLastFrame } from './utils';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

should();
use(chaiAsPromised);

describe('Basic Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
  });

  afterEach(async () => {
    await context.stop();
  });

  it('JavaScript exception in renderer process', async () => {
    await context.start('sentry-basic', 'javascript-renderer');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];
    const lastFrame = getLastFrame(event.data);

    expect(context.testServer.events.length).to.equal(1);
    expect(lastFrame.filename).to.equal(
      'app:///fixtures/javascript-renderer.js',
    );
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('JavaScript unhandledrejection in renderer process', async () => {
    await context.start('sentry-basic', 'javascript-unhandledrejection');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];
    const lastFrame = getLastFrame(event.data);

    expect(context.testServer.events.length).to.equal(1);
    expect(lastFrame.filename).to.equal(
      'app:///fixtures/javascript-unhandledrejection.js',
    );
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('JavaScript exception in main process', async () => {
    await context.start('sentry-basic', 'javascript-main');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];
    const lastFrame = getLastFrame(event.data);

    const mainRunning = context.mainProcess
      ? await context.mainProcess.isRunning()
      : false;

    // The default is not to terminate the main process on js error
    expect(mainRunning).to.equal(true);

    expect(context.testServer.events.length).to.equal(1);
    expect(lastFrame.filename).to.equal('app:///fixtures/javascript-main.js');
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it.skip('JavaScript exception in main process with space in path', async () => {
    await context.start('sentry-basic', 'javascript main with spaces');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];
    const lastFrame = getLastFrame(event.data);

    expect(context.testServer.events.length).to.equal(1);
    expect(lastFrame.filename).to.equal(
      'app:///fixtures/javascript main with spaces.js',
    );
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('onFatalError can be overridden to exit app', async () => {
    await context.start('sentry-onfatal-exit', 'javascript-main');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];
    const lastFrame = getLastFrame(event.data);

    // wait for the main process to die
    await context.waitForTrue(
      async () =>
        context.mainProcess ? !await context.mainProcess.isRunning() : false,
      'Timeout: Waiting for app to die',
    );

    expect(context.testServer.events.length).to.equal(1);
    expect(lastFrame.filename).to.equal('app:///fixtures/javascript-main.js');
    expect(event.dump_file).to.equal(undefined);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('Native crash in renderer process', async () => {
    await context.start('sentry-basic', 'native-renderer');
    // It can take rather a long time to get the event on Mac
    await context.waitForEvents(1, 20000);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.be.instanceOf(Buffer);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('Native crash in main process', async () => {
    await context.start('sentry-basic', 'native-main');

    // wait for the main process to die
    await context.waitForTrue(
      async () =>
        context.mainProcess ? !await context.mainProcess.isRunning() : false,
      'Timeout: Waiting for app to die',
    );

    // We have to restart the app to send native crashes from the main process
    await context.stop(false);
    await context.start('sentry-basic');

    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.be.instanceOf(Buffer);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });

  it('Captures breadcrumbs in renderer process', async () => {
    await context.start('sentry-basic', 'breadcrumbs-in-renderer');
    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    let breadcrumbs = event.data.breadcrumbs || [];

    breadcrumbs = breadcrumbs.filter(
      crumb => crumb.message === 'Something insightful!',
    );

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.equal(undefined);
    expect(breadcrumbs.length, 'filtered breadcrumbs').to.equal(1);
  });
});
