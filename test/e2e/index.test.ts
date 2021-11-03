import { should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as chaiSubset from 'chai-subset';
import { join } from 'path';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { getExampleRecipes, getCategorisedTestRecipes } from './recipe';
import { TestServer } from './server';
import { clearTestLog, getTestVersions, outputTestLog } from './utils';

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

  for (const electronVersion of getTestVersions()) {
    describe(`Electron v${electronVersion}`, () => {
      let testContext: TestContext | undefined;
      const electronPath = downloadElectron(electronVersion, 'x64');

      beforeEach(async () => {
        testServer.clearEvents();
        clearTestLog();
      });

      afterEach(async function () {
        await testContext?.stop();

        if (this.currentTest?.state === 'failed') {
          outputTestLog();
        }

        testContext = undefined;
      });

      describe(`Functional Test Recipes`, () => {
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
                testContext = new TestContext(await electronPath, appPath, appName);
                await recipe.runTests(testContext, testServer);
              });
            }
          });
        }
      });

      describe(`Example App Recipes`, () => {
        for (const recipe of getExampleRecipes(electronVersion)) {
          const fn = recipe.only ? it.only : it;

          fn(recipe.description, async function () {
            if (!recipe.shouldRun()) {
              this.skip();
            }

            const [appPath, appName] = await recipe.prepare(this, distDir);
            testContext = new TestContext(await electronPath, appPath, appName);
            await recipe.runTests(testContext, testServer);
          });
        }
      });
    });
  }
});
