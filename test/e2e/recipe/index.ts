import { Event } from '@sentry/types';
import { parseSemver } from '@sentry/utils';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { expect } from 'vitest';

import { SDK_VERSION } from '../../../src/main/version';
import { delay } from '../../helpers';
import { TestContext } from '../context';
import { ERROR_ID, HANG_ID, RATE_LIMIT_ID, SERVER_PORT, TestServer, TestServerEvent } from '../server';
import { createLogger, getTestLog, walkSync } from '../utils';
import { evaluateCondition } from './eval';
import { eventIsSession, normalize } from './normalize';
import { parseRecipe, TestRecipe } from './parser';

export * from './normalize';

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';
const JS_VERSION = require('../../../package.json').dependencies['@sentry/core'];

type CustomScript = { execute(events: TestServerEvent<Event>[]): Promise<void> };

const log = createLogger('Recipe Runner');

function loadRecipes(rootDir: string, electronVersion: string): RecipeRunner[] {
  return Array.from(walkSync(rootDir))
    .filter((p) => p.match(/recipe(?:\.only)*.yml$/))
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

function insertAfterLastImport(content: string, insert: string): string {
  const lines = content.split('\n');
  const importCount = lines.filter((l) => l.startsWith('import ')).length;

  let output = '';
  let count = 0;
  for (const line of lines) {
    output += `${line}\n`;

    if (line.startsWith('import ')) {
      count += 1;
    }

    if (count === importCount) {
      output += `${insert}\n`;
      count += 1;
    }
  }

  return output;
}

function convertToEsm(filename: string, content: string): [string, string] {
  if (filename.endsWith('package.json')) {
    const obj = JSON.parse(content);
    obj.main = obj.main.replace(/\.js$/, '.mjs');
    return [filename, JSON.stringify(obj)];
  }

  if (filename.endsWith('main.js')) {
    return [
      filename.replace(/\.js$/, '.mjs'),
      insertAfterLastImport(
        content
          .replace(/(?:const|var) (\{[\s\S]*?\}) = require\((\S*?)\)/g, 'import $1 from $2')
          .replace(/(?:const|var) (\S*) = require\((\S*)\)/g, 'import * as $1 from $2'),
        `import * as url from 'url';
const __dirname = url.fileURLToPath(new url.URL('.', import.meta.url));`,
      ),
    ];
  }

  return [filename, content];
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

  private get _appName(): string {
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

  public get timeout(): number {
    const timeout = (this._recipe.metadata.timeout || 30) * 1_000;
    return process.platform === 'darwin' ? timeout * 2 : timeout;
  }

  public async prepare(testBasePath: string): Promise<[string, string]> {
    log(`Preparing recipe '${this.description}'`);

    let appPath = join(testBasePath, this._appName);

    // Drop all the files
    for (const file of Object.keys(this._recipe.files)) {
      log(`Writing file '${file}'`);

      let content = this._recipe.files[file];

      // Replace with the test server localhost DSN
      content = content
        .replace('__DSN__', `http://${SENTRY_KEY}@localhost:${SERVER_PORT}/277345`)
        .replace('__INCORRECT_DSN__', `http://${SENTRY_KEY}@localhost:9999/277345`)
        .replace('__RATE_LIMIT_DSN__', `http://${SENTRY_KEY}@localhost:${SERVER_PORT}/${RATE_LIMIT_ID}`)
        .replace('__ERROR_DSN__', `http://${SENTRY_KEY}@localhost:${SERVER_PORT}/${ERROR_ID}`)
        .replace('__HANG_DSN__', `http://${SENTRY_KEY}@localhost:${SERVER_PORT}/${HANG_ID}`);

      if (file.endsWith('package.json')) {
        content = content
          // We replace the @sentry/electron dependency in package.json with the path to the tarball
          .replace(
            /"@sentry\/electron": ".*"/,
            `"@sentry/electron": "file:./../../../../sentry-electron-${SDK_VERSION}.tgz"`,
          )
          // We replace the Sentry JavaScript dependency versions to match that of @sentry/core
          .replace(/"@sentry\/replay": ".*"/, `"@sentry/replay": "${JS_VERSION}"`)
          .replace(/"@sentry\/react": ".*"/, `"@sentry/react": "${JS_VERSION}"`)
          .replace(/"@sentry\/integrations": ".*"/, `"@sentry/integrations": "${JS_VERSION}"`)
          .replace(/"@sentry\/vue": ".*"/, `"@sentry/vue": "${JS_VERSION}"`);
      }

      let filename = file;

      if (!this._recipe.metadata.skipEsmAutoTransform && (parseSemver(this._electronVersion).major || 0) >= 28) {
        [filename, content] = convertToEsm(file, content);
      }

      const path = join(appPath, filename);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }

    // Yarn v4 requires an empty yarn.lock file otherwise it complains that this is not part of the parent workspace
    if (!this._recipe.files['yarn.lock']) {
      writeFileSync(join(appPath, 'yarn.lock'), '');
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

    if (this._recipe.metadata.distPath) {
      appPath = join(appPath, this._recipe.metadata.distPath);
    }

    return [appPath, this._appName];
  }

  public async runTests(context: TestContext, testServer: TestServer): Promise<void> {
    await context.start();

    // Main process native crashes with Sentry Uploader are sent on the next run
    if (this._recipe.metadata.runTwice) {
      await context.waitForAppClose();
      log('First app instance has closed');
      await context.stop({ retainData: true });
      await context.start({ secondRun: true });
    }

    // Filter out events that are not for this platform/version
    const expectedEvents = this._recipe.expectedEvents.filter(
      (event) =>
        event.condition === undefined || evaluateCondition('event comparison', this._electronVersion, event.condition),
    );

    // If no events are expected, delay to ensure that none are sent!
    if (expectedEvents.length === 0) {
      await delay(2_000);
    }

    const totalEvents = expectedEvents.length + (this._recipe.customScriptPath ? 1 : 0);

    await context.waitForEvents(testServer, totalEvents);

    // If a test need to ensure no other events are received after the expected number of events, wait a bit longer
    if (this._recipe.metadata.waitAfterExpectedEvents) {
      log(`Waiting ${this._recipe.metadata.waitAfterExpectedEvents}ms to see if any more events are sent...`);
      await delay(this._recipe.metadata.waitAfterExpectedEvents);
    }

    if (totalEvents !== testServer.events.length) {
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

    if (this._recipe.customScriptPath) {
      log('Loading custom script', this._recipe.customScriptPath);
      const script: CustomScript = await import(this._recipe.customScriptPath);
      await script.execute(testServer.events as TestServerEvent<Event>[]);
      return;
    }

    for (const event of testServer.events) {
      normalize(event);
    }

    for (const [i, expectedEvent] of expectedEvents.entries()) {
      delete expectedEvent.condition;

      const isSession = eventIsSession(expectedEvent.data);

      log(`Comparing ${isSession ? 'session' : 'event'} ${i + 1} of ${expectedEvents.length}`);
      expect(testServer.events).containSubset([expectedEvent]);
    }

    log('Event comparisons passed!');
  }
}
