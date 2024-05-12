import updateVersion from './update-version.mjs';
import updateSdkVersions from './update-sdk-versions.mjs';
import checkPackageExports from './check-exports.mjs';

/**
 * Each script is made up of one or more commands.
 *
 * Commands can be:
 * - String commands to be executed in the shell
 * - String that refers to another script
 * - JavaScript functions (sync or async)
 */
scripts({
  clean: 'rimraf --glob coverage common esm main preload renderer index.* sentry-electron*.tgz .eslintcache',
  build: ['clean', updateVersion, 'rollup --config rollup.config.mjs', checkPackageExports],
  lint: [updateVersion, 'lint:prettier', 'lint:eslint'],
  'lint:prettier': 'prettier --check "{src,test}/**/*.ts"',
  'lint:eslint': 'eslint . --cache --format stylish',
  fix: [updateVersion, 'fix:prettier', 'fix:eslint'],
  'fix:prettier': 'prettier --write "{src,test}/**/*.ts"',
  'fix:eslint': 'eslint . --cache --format --fix',
  'update-electron-versions': 'electron-latest-versions --start 15 --beta > ./test/e2e/versions.json',
  'update-sdk-versions': updateSdkVersions,
  test: ['build', 'vitest run --root=./test/unit'],
  e2e: [
    'rimraf --glob test/e2e/dist/**/node_modules/@sentry/** test/e2e/dist/**/yarn.lock test/e2e/dist/**/package-lock.json',
    'yarn cache clean',
    'build',
    'npm pack',
    'xvfb-maybe vitest run --root=./test/e2e --silent=false --disable-console-intercept',
  ],
});

import { execSync } from 'child_process';

function scripts(scripts) {
  async function run(cmd) {
    for (const next of Array.isArray(scripts[cmd]) ? scripts[cmd] : [scripts[cmd]]) {
      if (typeof next === 'function') await next();
      else if (next in scripts) await run(next);
      else {
        console.log(`\n> ${next}`);
        execSync(next, { stdio: 'inherit' });
      }
    }
  }

  run(process.argv[2]);
}
