import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const response = await fetch('https://registry.npmjs.org/@sentry/core/latest');
const data = await response.json();
const latest = data.version;

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

  for (const dep of Object.keys(packageJson.peerDependencies)) {
    if (dep.match(re)) {
      packageJson.peerDependencies[dep] = latest;
    }
  }

  for (const dep of Object.keys(packageJson.devDependencies)) {
    if (dep.match(re)) {
      packageJson.devDependencies[dep] = latest;
    }
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Update yarn.lock
  spawnSync('yarn', ['install'], { stdio: 'inherit' });
  // Update parameter that has the version in it
  spawnSync('yarn', ['build'], { stdio: 'inherit' });
}

