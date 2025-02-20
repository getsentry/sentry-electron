import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, onTestFailed, test } from 'vitest';

import { TestContext } from './context';
import { downloadElectron } from './download';
import { getCategorisedTestRecipes, getExampleRecipes } from './recipe';
import { TestServer } from './server';
import { clearTestLog, getElectronTestVersions, outputTestLog } from './utils';

const distDir = join(__dirname, 'dist');

function hookTestFailure() {
  if (process.env.FAILURE_LOG) {
    onTestFailed(() => {
      outputTestLog();
    });
  }
}

describe('E2E Tests', async () => {
  const testServer = new TestServer();

  beforeAll(() => {
    testServer.start();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  for (const electronVersion of getElectronTestVersions()) {
    console.log(`Downloading Electron v${electronVersion}...`);
    const electronPath = await downloadElectron(electronVersion);
    console.log('Downloading complete!');

    describe(`Electron v${electronVersion}`, () => {
      let testContext: TestContext | undefined;

      beforeEach(async () => {
        testServer.clearEvents();
        clearTestLog();
      }, 60_000);

      afterEach(async () => {
        await testContext?.stop();
        testContext = undefined;
      }, 10_000);

      describe('Functional Test Recipes', () => {
        const categories = getCategorisedTestRecipes(electronVersion);

        for (const [category, recipes] of Object.entries(categories)) {
          describe(category, () => {
            for (const recipe of recipes) {
              const testFn = recipe.only ? test.only : test;

              testFn(
                recipe.description,
                async (ctx) => {
                  if (!recipe.shouldRun()) {
                    ctx.skip();
                  }

                  hookTestFailure();

                  const [appPath, appName] = await recipe.prepare(distDir);
                  testContext = new TestContext(await electronPath, electronVersion, appPath, appName);
                  await recipe.runTests(testContext, testServer);
                },
                recipe.timeout,
              );
            }
          });
        }
      });

      describe('Example App Recipes', () => {
        for (const recipe of getExampleRecipes(electronVersion)) {
          const testFn = recipe.only ? test.only : test;

          testFn(
            recipe.description,
            async (ctx) => {
              if (!recipe.shouldRun()) {
                ctx.skip();
              }

              hookTestFailure();

              const [appPath, appName] = await recipe.prepare(distDir);
              testContext = new TestContext(await electronPath, electronVersion, appPath, appName);
              await recipe.runTests(testContext, testServer);
            },
            recipe.timeout,
          );
        }
      });
    });
  }
});
