import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import { join } from 'path';
import { TestContext } from './context';
import { downloadElectron } from './download';
import { getLastFrame, getTests } from './utils';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

should();
use(chaiAsPromised);

const tests = getTests('1.7.14', '1.8.6', '2.0.5');

tests.forEach(([version, arch]) => {
  describe(`Test Electron ${version} ${arch}`, () => {
    let context: TestContext;

    beforeEach(async () => {
      const electronPath = await downloadElectron(version, arch);
      context = new TestContext(electronPath);
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
      expect(lastFrame.filename).to.equal('app:///fixtures/javascript-renderer.js');

      expect(event.dump_file).to.equal(undefined);
      expect(event.sentry_key).to.equal(SENTRY_KEY);
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('JavaScript unhandledrejection in renderer process', async () => {
      await context.start('sentry-basic', 'javascript-unhandledrejection');
      await context.waitForEvents(1);
      const event = context.testServer.events[0];
      const breadcrumbs = event.data.breadcrumbs || [];
      const lastFrame = getLastFrame(event.data);

      expect(context.testServer.events.length).to.equal(1);
      expect(lastFrame.filename).to.equal('app:///fixtures/javascript-unhandledrejection.js');
      expect(event.dump_file).to.equal(undefined);
      expect(event.sentry_key).to.equal(SENTRY_KEY);
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('JavaScript exception in main process', async () => {
      await context.start('sentry-basic', 'javascript-main');
      await context.waitForEvents(1);
      const event = context.testServer.events[0];
      const breadcrumbs = event.data.breadcrumbs || [];
      const lastFrame = getLastFrame(event.data);

      expect(context.testServer.events.length).to.equal(1);
      expect(lastFrame.filename).to.equal('app:///fixtures/javascript-main.js');
      expect(event.dump_file).to.equal(undefined);
      expect(event.sentry_key).to.equal(SENTRY_KEY);
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('JavaScript exception in main process with space in path', async () => {
      await context.start('sentry-basic', 'javascript main with spaces');
      await context.waitForEvents(1);
      const event = context.testServer.events[0];
      const breadcrumbs = event.data.breadcrumbs || [];
      const lastFrame = getLastFrame(event.data);

      expect(context.testServer.events.length).to.equal(1);
      expect(lastFrame.filename).to.equal('app:///fixtures/javascript main with spaces.js');
      expect(event.dump_file).to.equal(undefined);
      expect(event.sentry_key).to.equal(SENTRY_KEY);
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('onFatalError can be overridden', async () => {
      await context.start('sentry-onfatal-exit', 'javascript-main');
      await context.waitForEvents(1);
      const event = context.testServer.events[0];
      const breadcrumbs = event.data.breadcrumbs || [];
      const lastFrame = getLastFrame(event.data);

      expect(context.testServer.events.length).to.equal(1);
      expect(lastFrame.filename).to.equal('app:///fixtures/javascript-main.js');
      expect(event.dump_file).to.equal(undefined);
      expect(event.sentry_key).to.equal(SENTRY_KEY);
      expect(breadcrumbs.length).to.greaterThan(4);

      await context.waitForTrue(
        async () => (context.mainProcess ? !(await context.mainProcess.isRunning()) : false),
        'Timeout: Waiting for app to die',
      );
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
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('Native crash in main process', async () => {
      await context.start('sentry-basic', 'native-main');

      // wait for the main process to die
      await context.waitForTrue(
        async () => (context.mainProcess ? !(await context.mainProcess.isRunning()) : false),
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
      expect(breadcrumbs.length).to.greaterThan(4);
    });

    it('Captures breadcrumbs in renderer process', async () => {
      await context.start('sentry-basic', 'breadcrumbs-in-renderer');
      await context.waitForEvents(1);
      const event = context.testServer.events[0];
      let breadcrumbs = event.data.breadcrumbs || [];

      breadcrumbs = breadcrumbs.filter(crumb => crumb.message === 'Something insightful!');

      expect(context.testServer.events.length).to.equal(1);
      expect(event.dump_file).to.equal(undefined);
      expect(breadcrumbs.length, 'filtered breadcrumbs').to.equal(1);
    });

    it('Loaded via preload script with nodeIntegration disabled', async () => {
      const electronPath = await downloadElectron(version, arch);
      context = new TestContext(electronPath, join(__dirname, 'preload-app'));
      await context.start();
      await context.waitForEvents(1);
      const event = context.testServer.events[0];

      expect(context.testServer.events.length).to.equal(1);
      expect(event.dump_file).to.equal(undefined);
    });
  });
});
