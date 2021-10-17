import { parseSemver } from '@sentry/utils';
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Context, createContext, runInContext } from 'vm';
import { expect } from 'chai';
import { inspect } from 'util';

import { SDK_VERSION } from '../../../src/main/version';
import { TestServer } from '../server';
import { createLogger } from '../utils';
import { normalize } from './normalize';
import { parseRecipe, TestRecipe } from './parser';
import { TestContext } from '../context';

export * from './normalize';

const log = createLogger('Recipe Runner');

function* walkSync(dir: string): Generator<string> {
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* walkSync(join(dir, file.name));
    } else {
      yield join(dir, file.name);
    }
  }
}

function loadRecipes(rootDir: string): RecipeRunner[] {
  return Array.from(walkSync(rootDir))
    .filter((p) => p.endsWith('.md'))
    .map((p) => RecipeRunner.load(p));
}

export function getExampleRecipes(): RecipeRunner[] {
  return loadRecipes(join(__dirname, '..', '..', '..', 'examples'));
}

export function getTestRecipes(): Record<string, RecipeRunner[]> {
  const allRecipes = loadRecipes(join(__dirname, '..', 'test-apps'));

  return allRecipes.reduce((obj, cur) => {
    if (obj[cur.category || 'Others']) {
      obj[cur.category || 'Others'].push(cur);
    } else {
      obj[cur.category || 'Others'] = [cur];
    }
    return obj;
  }, {} as Record<string, RecipeRunner[]>);
}

function getEvalContext(electronVersion: string): Context {
  const parsed = parseSemver(electronVersion);
  const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };
  const platform = process.platform;

  const usesCrashpad =
    platform === 'darwin' ||
    (platform === 'win32' && version.major >= 6) ||
    (platform === 'linux' && version.major >= 15);

  const supportsContextIsolation = version.major >= 6;

  return createContext({ version, platform, usesCrashpad, supportsContextIsolation });
}

export class RecipeRunner {
  private constructor(private readonly _recipe: TestRecipe) {}

  public static load(path: string): RecipeRunner {
    return new RecipeRunner(parseRecipe(path));
  }

  public shouldRun(electronVersion: string): boolean {
    if (this._recipe.metadata.condition == undefined) {
      return true;
    }

    const context = getEvalContext(electronVersion);
    log(
      `Evaluating condition: '${this._recipe.metadata.condition}' with context: ${inspect(context, false, null, true)}`,
    );
    const result = runInContext(this._recipe.metadata.condition, context);

    if (result == false) {
      log('Condition result equals false. Skipping test.');
    }

    return result;
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

    if (this._recipe.metadata.timeout) {
      context.timeout(this._recipe.metadata.timeout * 1000);
    }

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

    await context.waitForEvents(testServer, this._recipe.expectedEvents?.length || 0);

    const expNumEvents = this._recipe.expectedEvents.length;

    if (expNumEvents !== testServer.events.length) {
      throw new Error(`Expected ${expNumEvents} events but server has ${testServer.events.length} events`);
    }

    for (const event of testServer.events) {
      event.data = normalize(event.data);
    }

    for (const [i, expectedEvent] of this._recipe.expectedEvents.entries()) {
      log(`Comparing event ${i + 1} of ${expNumEvents}`);
      expect(testServer.events).to.containSubset([expectedEvent]);
    }

    log('Event comparisons passed!');
  }
}
