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
    await context.start('javascript-renderer');
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

  it('JavaScript exception in main process', async () => {
    await context.start('javascript-main');
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
    await context.start('javascript main with spaces');
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

  it('Native crash in renderer process', async () => {
    await context.start('native-renderer');
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
    await context.start('native-main');

    // wait for the main process to die
    await context.waitForTrue(
      async () =>
        context.mainProcess ? !await context.mainProcess.isRunning() : false,
      'Timeout: Waiting for app to die',
    );

    // We have to restart the app to send native crashes from the main process
    await context.stop(false);
    await context.start();

    await context.waitForEvents(1);
    const event = context.testServer.events[0];
    const breadcrumbs = event.data.breadcrumbs || [];

    expect(context.testServer.events.length).to.equal(1);
    expect(event.dump_file).to.be.instanceOf(Buffer);
    expect(event.sentry_key).to.equal(SENTRY_KEY);
    expect(breadcrumbs.length).to.greaterThan(5);
  });
});
