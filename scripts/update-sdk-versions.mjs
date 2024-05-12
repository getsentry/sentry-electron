import latestVersion from 'latest-version';
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default async function () {
  const latest = await latestVersion('@sentry/core');
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
  const current = packageJson.dependencies['@sentry/core'];

  if (current !== latest) {
    console.log(`Updating Sentry deps from ${current} to ${latest}`);

    const re = /^@sentry(-internal)?\//;

    for (const dep of Object.keys(packageJson.dependencies)) {
      if (dep.match(re)) {
        packageJson.dependencies[dep] = latest;
      }
    }

    for (const dep of Object.keys(packageJson.devDependencies)) {
      if (dep.match(re)) {
        packageJson.devDependencies[dep] = latest;
      }
    }

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Update lock file
    spawnSync('npm', ['install'], { stdio: 'inherit' });
    // Update parameter that has the version in it
    spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  }
}
