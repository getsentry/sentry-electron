import { should, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as chaiSubset from 'chai-subset';
import { join } from 'path';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { getExampleRecipes, getTestRecipes } from './recipe';
import { TestServer } from './server';
import { getTestVersions } from './utils';

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
      });

      afterEach(async function () {
        const failed = this.currentTest?.state === 'failed';
        await testContext?.stop({ logStdout: failed });

        if (failed) {
          testServer.logEvents();
        }

        testContext = undefined;
      });

      describe(`Functional Test Recipes`, () => {
        const categories = getTestRecipes();

        for (const category of Object.keys(categories)) {
          describe(category, () => {
            for (const recipe of categories[category]) {
              it(recipe.description, async function () {
                if (!recipe.shouldRun(electronVersion)) {
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

      // describe(`Example App Recipes`, () => {
      //   for (const recipe of getExampleRecipes()) {
      //     it(recipe.description, async function () {
      //       if (!recipe.shouldRun(electronVersion)) {
      //         this.skip();
      //       }

      //       const appPath = await recipe.prepare(this, distDir);
      //       testContext = new TestContext(await electronPath, appPath);
      //       await recipe.runTests(testContext, testServer);
      //     });
      //   }
      // });
    });
  }
});
