import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { spawnSync, SpawnSyncOptionsWithBufferEncoding } from 'child_process';
import { join } from 'path';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { TestServer } from './server';
import { getLastFrame } from './utils';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

should();
use(chaiAsPromised);

const versions = process.env.ELECTRON_VERSION
  ? [process.env.ELECTRON_VERSION]
  : [
      '2.0.18',
      '3.1.13',
      '4.2.12',
      '5.0.13',
      '6.1.12',
      '7.3.3',
      '8.5.5',
      '9.4.4',
      '10.4.7',
      '11.4.10',
      '12.0.15',
      '13.1.7',
      '14.0.0-beta.17',
      '15.0.0-nightly.20210721',
    ];

const tests = versions.map((v) => [v, 'x64']);

describe('Bundle Tests', () => {
  it('Webpack contextIsolation app', async function () {
    this.timeout(60000);

    const options: SpawnSyncOptionsWithBufferEncoding = {
      shell: true,
      cwd: join(__dirname, 'test-apps', 'isolated-app'),
    };

    if (process.env.DEBUG) {
      options.stdio = 'inherit';
    }

    const result = spawnSync('yarn && yarn build', options);
    expect(result.status).to.equal(0);
  });
});

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

    describe(`Electron ${version} ${arch}`, () => {
      let context: TestContext;

      beforeEach(async () => {
        testServer.clearEvents();

        const electronPath = await downloadElectron(version, arch);
        context = new TestContext(electronPath);
      });

      afterEach(async () => {
        if (context.isStarted()) {
          await context.stop();
        }
      });

      it('JavaScript exception in renderer process', async () => {
        await context.start('sentry-basic', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.false;
        expect(event.data.platform).to.equal('javascript');
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript-renderer.js');
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      it('JavaScript unhandledrejection in renderer process', async () => {
        await context.start('sentry-basic', 'javascript-unhandledrejection');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.false;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.sdk?.name).to.equal('sentry.javascript.electron');
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript-unhandledrejection.js');
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      it('JavaScript exception in main process', async () => {
        await context.start('sentry-basic', 'javascript-main');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('browser');
        expect(event.dump_file).to.be.false;
        expect(event.data.platform).to.equal('node');
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.sdk?.name).to.equal('sentry.javascript.electron');
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript-main.js');
      });

      it('JavaScript exception in main process with spaces and parentheses in path', async () => {
        await context.start('sentry-basic', 'javascript main with (parens)');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('browser');
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript main with (parens).js');
        expect(event.dump_file).to.be.false;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      // tslint:disable-next-line
      it('Native crash in renderer process', async function () {
        await context.start('sentry-basic', 'native-renderer');
        // It can take rather a long time to get the event on Mac
        await context.waitForEvents(testServer, 1, 20000);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.true;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      // tslint:disable-next-line
      it('Native crash in main process with Electron uploader', async function () {
        if (majorVersion < 9) {
          this.skip();
        }

        await context.start('sentry-electron-uploader-main', 'native-main');
        // It can take rather a long time to get the event on Mac
        await context.waitForEvents(testServer, 1, 20000);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.method).to.equal('minidump');

        if (majorVersion >= 15 || process.platform !== 'linux') {
          expect(event.data.contexts?.app?.app_name).to.equal('test-app');
          expect(event.data.contexts?.electron?.crashed_process).to.equal('browser');
          expect(event.data.user?.id).to.equal('ABCDEF1234567890');
          expect(event.namespaced?.initialScope?.user?.username).to.equal('some_user');
        }
      });

      // tslint:disable-next-line
      it('Native crash in renderer process with Electron uploader', async function () {
        if (majorVersion < 9) {
          this.skip();
        }

        await context.start('sentry-electron-uploader-renderer', 'native-renderer');
        // It can take rather a long time to get the event on Mac
        await context.waitForEvents(testServer, 1, 20000);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.method).to.equal('minidump');

        if (majorVersion >= 15 || process.platform !== 'linux') {
          expect(event.namespaced?.initialScope?.user?.username).to.equal('some_user');
        }
      });

      it('GPU crash with Electron uploader', async function () {
        if (majorVersion < 13 || (process.platform === 'linux' && majorVersion < 15)) {
          this.skip();
        }

        await context.start('sentry-electron-uploader-main', 'native-gpu');
        await context.waitForEvents(testServer, 1, 20000);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.method).to.equal('minidump');
        expect(event.namespaced?.initialScope?.user?.username).to.equal('some_user');
      });

      it('JavaScript exception in main process with user data', async () => {
        await context.start('sentry-scope-user-data', 'javascript-main');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];
        expect(event.data.user?.id).to.equal('johndoe');
      });

      // tslint:disable-next-line
      it('Native crash in main process', async function () {
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

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('browser');
        expect(event.dump_file).to.be.true;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      it('Captures breadcrumbs in renderer process', async () => {
        await context.start('sentry-basic', 'breadcrumbs-in-renderer');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.false;

        const breadcrumbs = event.data.breadcrumbs?.filter((crumb) => crumb.message === 'Something insightful!');
        expect(breadcrumbs?.length, 'filtered breadcrumbs').to.equal(1);
      });

      it('Captures Scope from renderer', async () => {
        await context.start('sentry-basic', 'scope-data-renderer');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.data.extra?.a).to.equal(2);
        expect(event.data.user?.id).to.equal('1');
        expect(event.data.tags?.a).to.equal('b');
        expect(event.data.contexts?.server).to.include({ id: '2' });
        expect(event.data.fingerprint).to.include('abcd');
      });

      it('Captures Scope from main', async () => {
        await context.start('sentry-basic', 'scope-data-main');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('browser');
        expect(event.data.extra?.a).to.equal(2);
        expect(event.data.user?.id).to.equal('2');
        expect(event.data.tags?.a).to.equal('b');
        expect(event.data.contexts?.server).to.include({ id: '2' });
        expect(event.data.fingerprint).to.include('abcd');
      });

      it('Main scope not clobbered by scope from renderer', async () => {
        await context.start('sentry-basic', 'scope-data-merged');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.extra?.a).to.equal(2);
        expect(event.data.user?.id).to.equal('5');
        expect(event.data.user?.email).to.equal('none@test.org');
        expect(event.data.tags?.a).to.equal('b');
        expect(event.data.contexts?.server).to.include({ id: '2' });
        expect(event.data.fingerprint).to.include('abcd');
      });

      it('Custom release string for JavaScript error', async () => {
        await context.start('sentry-custom-release', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.release).to.equal('some-custom-release');
        expect(event.dump_file).to.be.false;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript-renderer.js');
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      it('Custom release string for minidump', async function () {
        await context.start('sentry-custom-release', 'native-renderer');
        // It can take rather a long time to get the event on Mac
        await context.waitForEvents(testServer, 1, 20000);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];

        expect(event.data.release).to.equal('some-custom-release');
        expect(event.method).to.equal('envelope');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.dump_file).to.be.true;
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(event.data.breadcrumbs?.length).to.greaterThan(4);
      });

      it('Custom named renderer process', async () => {
        await context.start('sentry-custom-renderer-name', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);
        const event = testServer.events[0];

        expect(testServer.events.length).to.equal(1);
        expect(event.data.contexts?.electron?.crashed_process).to.equal('SomeWindow');
      });

      it('JavaScript exception in contextIsolation renderer process', async function () {
        // contextIsolation only added >= 6
        if (majorVersion < 6) {
          this.skip();
        }

        const electronPath = await downloadElectron(version, arch);
        context = new TestContext(electronPath, join(__dirname, 'test-apps', 'isolated-app'));
        await context.start();
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.data.contexts?.app?.app_name).to.equal('isolated-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.false;
        expect(event.data.user?.id).to.equal('abc-123');
      });

      it('JavaScript exception in renderer process sent with browser SDK', async () => {
        await context.start('sentry-browser', 'javascript-renderer');
        await context.waitForEvents(testServer, 1);

        expect(testServer.events.length).to.equal(1);
        const event = testServer.events[0];
        expect(event.method).to.equal('store');
        expect(event.data.contexts?.app?.app_name).to.equal('test-app');
        expect(event.data.contexts?.electron?.crashed_process).to.equal('WebContents[1]');
        expect(event.dump_file).to.be.false;
        expect(event.data.platform).to.equal('javascript');
        expect(event.sentry_key).to.equal(SENTRY_KEY);
        expect(getLastFrame(event.data).filename).to.equal('app:///fixtures/javascript-renderer.js');
        expect(event.data.breadcrumbs?.length).to.greaterThanOrEqual(1);
      });
    });
  });
});
