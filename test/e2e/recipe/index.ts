import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { expect } from 'chai';

import { SDK_VERSION } from '../../../src/main/version';
import { TestServer } from '../server';
import { createLogger, getTestLog, walkSync } from '../utils';
import { normalize } from './normalize';
import { parseRecipe, TestRecipe } from './parser';
import { TestContext } from '../context';
import { evaluateCondition } from './eval';

export * from './normalize';

const log = createLogger('Recipe Runner');

function loadRecipes(rootDir: string, electronVersion: string): RecipeRunner[] {
  return Array.from(walkSync(rootDir))
    .filter((p) => p.match(/README(?:\.only)*.md$/))
    .reduce((arr, p) => {
      try {
        arr.push(RecipeRunner.load(electronVersion, p));
      } catch (e) {
        console.error(e);
      }
      return arr;
    }, [] as RecipeRunner[]);
}

export function getExampleRecipes(electronVersion: string): RecipeRunner[] {
  return loadRecipes(join(__dirname, '..', '..', '..', 'examples'), electronVersion);
}

export function getCategorisedTestRecipes(electronVersion: string): Record<string, RecipeRunner[]> {
  const allRecipes = loadRecipes(join(__dirname, '..', 'test-apps'), electronVersion);

  return allRecipes.reduce((obj, cur) => {
    const cat = cur.category || 'Other';
    if (obj[cat]) {
      obj[cat].push(cur);
    } else {
      obj[cat] = [cur];
    }
    return obj;
  }, {} as Record<string, RecipeRunner[]>);
}

export class RecipeRunner {
  private constructor(private readonly _electronVersion: string, private readonly _recipe: TestRecipe) {}

  public static load(electronVersion: string, path: string): RecipeRunner {
    return new RecipeRunner(electronVersion, parseRecipe(path));
  }

  public shouldRun(): boolean {
    return evaluateCondition('test run', this._electronVersion, this._recipe.metadata.condition);
  }

  public get only(): boolean {
    return this._recipe.only;
  }

  public get description(): string {
    return this._recipe.metadata.description;
  }

  public get category(): string | undefined {
    return this._recipe.metadata.category;
  }

  private get appName(): string {
    const erStr = 'Recipe needs a package.json with "name" field';

    const pkgJson = this._recipe.files['package.json'];
    if (!pkgJson) {
      throw new Error(erStr);
    }

    const pkg = JSON.parse(pkgJson);
    if (!pkg.name) {
      throw new Error(erStr);
    }

    return pkg.name;
  }

  public async prepare(context: Mocha.Context, testBasePath: string): Promise<[string, string]> {
    log(`Preparing recipe '${this.description}'`);

    const timeout = this._recipe.metadata.timeout || 30_000;
    // macOS runs quite slowly in GitHub actions
    context.timeout(process.platform === 'darwin' ? timeout * 2 : timeout);

    const appPath = join(testBasePath, this.appName);

    // Drop all the files
    for (const file of Object.keys(this._recipe.files)) {
      log(`Writing file '${file}'`);

      const path = join(appPath, file);

      mkdirSync(dirname(path), { recursive: true });
      let content = this._recipe.files[file];

      // Replace with the test server localhost DSN
      content = content.replace('__DSN__', 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345');

      // We replace the @sentry/electron dependency in package.json with
      // the path to the tarball
      if (file.endsWith('package.json')) {
        content = content.replace(
          /"@sentry\/electron": ".*"/,
          `"@sentry/electron": "file:./../../../../sentry-electron-${SDK_VERSION}.tgz"`,
        );
      }

      writeFileSync(path, content);
    }

    if (this._recipe.metadata.command) {
      log(`Running command '${this._recipe.metadata.command}'`);

      const result = spawnSync(this._recipe.metadata.command, {
        shell: true,
        cwd: appPath,
        stdio: process.env.DEBUG ? 'inherit' : 'pipe',
      });

      if (result.status) {
        console.error(result.stdout?.toString());
        console.error(result.stderr?.toString());
        throw new Error('Recipe command failed');
      }
    }

    return [appPath, this.appName];
  }

  public async runTests(context: TestContext, testServer: TestServer): Promise<void> {
    await context.start();

    // Main process native crashes with Sentry Uploader are sent on the next run
    if (this._recipe.metadata.runTwice) {
      await context.waitForAppClose();
      await context.stop({ retainData: true });
      await context.start({ secondRun: true });
    }

    // Filter out events that are not for this platform/version
    const expectedEvents = this._recipe.expectedEvents.filter(
      (event) =>
        event.condition === undefined || evaluateCondition('event comparison', this._electronVersion, event.condition),
    );

    await context.waitForEvents(testServer, expectedEvents.length);

    if (expectedEvents.length !== testServer.events.length) {
      throw new Error(`Expected ${expectedEvents.length} events but server has ${testServer.events.length} events`);
    }

    // Checks the app output for an expected error string
    if (this._recipe.metadata.expectedError) {
      // if there are no expected events, at least wait until the app closes
      if (expectedEvents.length === 0) {
        await context.waitForAppClose();
      }

      const log = getTestLog().join(' ');
      expect(log).to.include(this._recipe.metadata.expectedError);
    }

    for (const event of testServer.events) {
      event.data = normalize(event.data);
    }

    for (const [i, expectedEvent] of expectedEvents.entries()) {
      delete expectedEvent.condition;
      log(`Comparing event ${i + 1} of ${expectedEvents.length}`);
      expect(testServer.events).to.containSubset([expectedEvent]);
    }

    log('Event comparisons passed!');
  }
}
