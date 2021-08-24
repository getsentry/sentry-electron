import { Event, Session } from '@sentry/types';
import { expect, should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as chaiSubset from 'chai-subset';
import { join } from 'path';
import { inspect } from 'util';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { normaliseEvent } from './normalize';
import { getRecipes } from './recipe-runner';
import { TestServer, TestServerEvent } from './server';
import { getTestVersions } from './utils';

should();
use(chaiAsPromised);
use(chaiSubset);

const distDir = join(__dirname, 'dist');

describe('Recipe Tests', () => {
  let testServer: TestServer;

  before(() => {
    testServer = new TestServer();
    testServer.start();
  });

  after(async () => {
    await testServer.stop();
  });

  getTestVersions().forEach((version) => {
    const arch = 'x64';

    describe(`Electron ${version} ${arch}`, () => {
      let context: TestContext | undefined;

      beforeEach(async () => {
        testServer.clearEvents();
      });

      afterEach(async function () {
        if (context && this.currentTest?.state === 'failed') {
          console.log('App stdout: ', context.processStdOut);
          if (testServer.events.length) {
            console.log('Events received: ', inspect(testServer.events, false, null, true));
          } else {
            console.log('No Events received');
          }
        }

        if (context && context.isStarted()) {
          await context.stop();
        }
      });

      getRecipes(version).forEach((recipe) => {
        it(recipe.description, async function () {
          if (recipe.timeout) {
            this.timeout(recipe.timeout * 1000);
          }

          const appPath = await recipe.prepare(distDir);

          const electronPath = await downloadElectron(version, arch);
          context = new TestContext(electronPath, appPath);

          await context.start();
          await context.waitForEvents(testServer, recipe.numEvents);

          for (const event of testServer.events) {
            if ((event as TestServerEvent<Session>).data.sid) {
              //
            } else {
              event.data = normaliseEvent((event as TestServerEvent<Event>).data);
            }
          }

          for (const event of recipe.events) {
            expect(testServer.events).to.containSubset([event]);
          }
        });
      });
    });
  });
});
