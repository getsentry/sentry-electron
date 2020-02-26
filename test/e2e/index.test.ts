import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import { join } from 'path';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { TestServer } from './server';
import { delay, getLastFrame, getTests } from './utils';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

should();
use(chaiAsPromised);

const tests = getTests('1.7.16', '1.8.8', '2.0.18', '3.1.13', '4.2.12', '5.0.13', '6.1.7', '7.1.11', '8.0.0');

describe('E2E Tests', () => {
  let testServer: TestServer;

  before(() => {
    testServer = new TestServer();
    testServer.start();
  });

  after(async () => {
    await testServer.stop();
  });

  tests.forEach(([version, arch]) => {
    const majorVersion = Math.floor(parseFloat(version));
    if (majorVersion < 3 && process.platform === 'linux') {
      // We skip tests on linux for electron version < 3
      return;
    }

    if (majorVersion === 4 && process.platform === 'win32') {
      // We skip electron version 4 on Windows as it wont pass on Travis
      return;
    }

    describe(`Electron ${version} ${arch}`, () => {
      let context: TestContext;

      beforeEach(async () => {
        testServer.clearEvents();

        const electronPath = await downloadElectron(version, arch);
        context = new TestContext(electronPath);
      });

      afterEach(async () => {
        await context.stop();
      });

      it('JavaScript exception in renderer process', async () => {
        await context.start('sentry-basic', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript-renderer.js');

        expect(event.dump_file).to.equal(undefined);
        expect(event.data.platform).to.equal('javascript');
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('JavaScript unhandledrejection in renderer process', async () => {
        await context.start('sentry-basic', 'javascript-unhandledrejection');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript-unhandledrejection.js');
        expect(event.dump_file).to.equal(undefined);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.sdk!.name).to.equal('sentry.javascript.electron');
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('JavaScript exception in main process', async () => {
        await context.start('sentry-basic', 'javascript-main');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript-main.js');
        expect(event.dump_file).to.equal(undefined);
        expect(event.data.platform).to.equal('node');
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.sdk!.name).to.equal('sentry.javascript.electron');
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('JavaScript exception in main process with space in path', async () => {
        await context.start('sentry-basic', 'javascript main with spaces');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript main with spaces.js');
        expect(event.dump_file).to.equal(undefined);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('JavaScript exception in main process with parentheses in path', async () => {
        await context.start('sentry-basic', 'javascript main with (parens)');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript main with (parens).js');
        expect(event.dump_file).to.equal(undefined);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      // tslint:disable-next-line
      it('onFatalError can be overridden', async function() {
        // For some unknown reason this test fails on Electron v5 only on Travis
        if (majorVersion === 5 && process.platform === 'win32') {
          this.skip();
        }

        await context.start('sentry-onfatal-exit', 'javascript-main');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(testServer.events.length).to.equal(1);
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
        await context.waitForEvents(testServer, 1, 20000);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];

        expect(testServer.events.length).to.equal(1);
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

        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];

        expect(testServer.events.length).to.equal(1);
        expect(event.dump_file).to.be.instanceOf(Buffer);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('Captures breadcrumbs in renderer process', async () => {
        await context.start('sentry-basic', 'breadcrumbs-in-renderer');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        let breadcrumbs = event.data.breadcrumbs || [];

        breadcrumbs = breadcrumbs.filter(crumb => crumb.message === 'Something insightful!');

        expect(testServer.events.length).to.equal(1);
        expect(event.dump_file).to.equal(undefined);
        expect(breadcrumbs.length, 'filtered breadcrumbs').to.equal(1);
      });

      it('Loaded via preload script with nodeIntegration disabled', async () => {
        const electronPath = await downloadElectron(version, arch);
        context = new TestContext(electronPath, join(__dirname, 'preload-app'));
        await context.start();
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];

        expect(testServer.events.length).to.equal(1);
        expect(event.dump_file).to.equal(undefined);
      });

      it('Custom release string for JavaScript error', async () => {
        await context.start('sentry-custom-release', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const lastFrame = getLastFrame(event.data);

        expect(event.data.release).to.equal('some-custom-release');

        expect(testServer.events.length).to.equal(1);
        expect(lastFrame.filename).to.equal('app:///fixtures/javascript-renderer.js');

        expect(event.dump_file).to.equal(undefined);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('Custom release string for minidump', async () => {
        await context.start('sentry-custom-release', 'native-renderer');
        // It can take rather a long time to get the event on Mac
        await context.waitForEvents(testServer, 1, 20000);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];

        expect(event.data.release).to.equal('some-custom-release');

        expect(testServer.events.length).to.equal(1);
        expect(event.dump_file).to.be.instanceOf(Buffer);
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(breadcrumbs.length).to.greaterThan(4);
      });

      it('Scope is persisted between app restarts', async () => {
        await context.start('sentry-basic');
        await delay(5000);
        // We restart the app and keep the context
        await context.stop(false);

        await context.start('sentry-basic', 'javascript-renderer');

        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        const breadcrumbs = event.data.breadcrumbs || [];
        const appReadyBreadCrumbs = breadcrumbs.filter(b => b.message && b.message.includes('app.ready'));

        expect(appReadyBreadCrumbs.length).to.equal(2);
      });

      it('Custom named renderer process', async () => {
        await context.start('sentry-custom-renderer-name', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];

        expect(testServer.events.length).to.equal(1);
        expect(event.data.extra && event.data.extra.crashed_process).to.equal('renderer');
      });
    });
  });
});
