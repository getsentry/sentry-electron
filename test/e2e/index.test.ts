import { should, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { join } from 'path';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { getCategorisedTestRecipes, getExampleRecipes } from './recipe';
import { TestServer } from './server';
import { clearTestLog, getElectronTestVersions, outputTestLog } from './utils';

should();
use(chaiAsPromised);
use(chaiSubset);

const distDir = join(__dirname, 'dist');

describe('E2E Tests', () => {
  const testServer = new TestServer();

  before(() => {
    testServer.start();
  });

  after(async () => {
    await testServer.stop();
  });

  for (const electronVersion of getElectronTestVersions()) {
    describe(`Electron v${electronVersion}`, () => {
      let testContext: TestContext | undefined;
      const electronPath = downloadElectron(electronVersion);

      beforeEach(async function () {
        testServer.clearEvents();
        clearTestLog();
      });

      afterEach(async function () {
        this.timeout(10_000);
        await testContext?.stop();

        if (process.env.FAILURE_LOG && this.currentTest?.state === 'failed') {
          outputTestLog();
        }

        testContext = undefined;
      });

      describe('Functional Test Recipes', () => {
        const categories = getCategorisedTestRecipes(electronVersion);

        for (const category of Object.keys(categories)) {
          describe(category, () => {
            for (const recipe of categories[category]) {
              const fn = recipe.only ? it.only : it;

              fn(recipe.description, async function () {
                if (!recipe.shouldRun()) {
                  this.skip();
                }

                const [appPath, appName] = await recipe.prepare(this, distDir);
                testContext = new TestContext(await electronPath, electronVersion, appPath, appName);
                await recipe.runTests(testContext, testServer);
              });
            }
          });
        }
      });

      describe('Example App Recipes', () => {
        for (const recipe of getExampleRecipes(electronVersion)) {
          const fn = recipe.only ? it.only : it;

          fn(recipe.description, async function () {
            if (!recipe.shouldRun()) {
              this.skip();
            }

            const [appPath, appName] = await recipe.prepare(this, distDir);
            testContext = new TestContext(await electronPath, electronVersion, appPath, appName);
            await recipe.runTests(testContext, testServer);
          });
        }
      });
    });
  }
});
