import { Event } from '@sentry/types';
import { parseSemver } from '@sentry/utils';
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { createContext, runInContext } from 'vm';

import { SDK_VERSION } from '../../src/main/context';
import { parseRecipe, TestRecipe } from './recipe-parser';
import { TestServerEvent } from './server';

export function getRecipes(electronVersion: string): RecipeRunner[] {
  const recipeDir = join(__dirname, 'recipes');
  const files = readdirSync(recipeDir)
    .filter((p) => p.endsWith('.md'))
    .map((p) => join(recipeDir, p));
  return files.map((p) => RecipeRunner.load(p)).filter((r) => r.shouldRun(electronVersion));
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

    const parsed = parseSemver(electronVersion);
    const version = { major: parsed.major || 0, minor: parsed.minor || 0, patch: parsed.patch || 0 };
    const platform = process.platform;
    const usesCrashpad =
      platform === 'darwin' ||
      (platform === 'win32' && version.major >= 6) ||
      (platform === 'linux' && version.major >= 15);

    const context = { version, platform, usesCrashpad };
    createContext(context);

    return runInContext(this._recipe.metadata.condition, context);
  }

  public get description(): string {
    return this._recipe.metadata.description;
  }

  public get timeout(): number | undefined {
    return this._recipe.metadata.timeout;
  }

  public get appName(): string {
    const pkgJson = this._recipe.files['package.json'];
    if (!pkgJson) {
      throw new Error('Recipe needs a package.json with "name" field');
    }

    const pkg = JSON.parse(pkgJson);
    if (!pkg.name) {
      throw new Error('Recipe needs a package.json with "name" field');
    }

    return pkg.name;
  }

  public get events(): TestServerEvent<Event>[] {
    return this._recipe.events;
  }

  public get numEvents(): number {
    return (this._recipe.events?.length || 0) + (this._recipe.sessions?.length || 0);
  }

  public async prepare(basePath: string): Promise<string> {
    const appPath = join(basePath, this.appName);

    // Drop all the files
    for (const file of Object.keys(this._recipe.files)) {
      const path = join(appPath, file);

      mkdirSync(dirname(path), { recursive: true });
      let content = this._recipe.files[file];

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
      const result = spawnSync(this._recipe.metadata.command, {
        shell: true,
        cwd: appPath,
        stdio: process.env.DEBUG ? 'inherit' : 'pipe',
      });

      if (result.status) {
        console.error(result.stdout.toString());
        console.error(result.stderr.toString());
        throw new Error('Command failed');
      }
    }

    return appPath;
  }
}
