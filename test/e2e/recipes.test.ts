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

describe('Recipe Tests', () => {
  const testServer = new TestServer();

  before(() => {
    testServer.start();
  });

  after(async () => {
    await testServer.stop();
  });

  for (const electronVersion of getTestVersions()) {
    const electronArch = 'x64';

    describe(`Electron ${electronVersion} ${electronArch}`, () => {
      let testContext: TestContext | undefined;
      const electronPath = downloadElectron(electronVersion, electronArch);

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
        for (const recipe of getTestRecipes()) {
          it(recipe.description, async function () {
            if (!recipe.shouldRun(electronVersion)) {
              this.skip();
            }

            const appPath = await recipe.prepare(this, distDir);
            testContext = new TestContext(await electronPath, appPath);
            await recipe.runTests(testContext, testServer);
          });
        }
      });

      describe(`Example App Recipes`, () => {
        for (const recipe of getExampleRecipes()) {
          it(recipe.description, async function () {
            if (!recipe.shouldRun(electronVersion)) {
              this.skip();
            }

            const appPath = await recipe.prepare(this, distDir);
            testContext = new TestContext(await electronPath, appPath);
            await recipe.runTests(testContext, testServer);
          });
        }
      });
    });
  }
});
