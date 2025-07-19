import * as child_process from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { SDK_VERSION as JS_SDK_VERSION } from '@sentry/core';
import { dirname, join, sep } from 'path';
import { SDK_VERSION } from '../../src/main/version';
import { ERROR_ID, HANG_ID, RATE_LIMIT_ID } from './server';
import { TestLogger, walkSync } from './utils';

const exec = promisify(child_process.exec);

const SENTRY_KEY = '37f8a2ee37c0409d8970bc7559c7c7e4';

function getFiles(rootDir: string): Record<string, string> {
  return Array.from(walkSync(rootDir))
    .filter((path) => !path.endsWith('test.ts'))
    .reduce((acc, absPath) => {
      const relPath = absPath.replace(rootDir + sep, '');
      acc[relPath] = readFileSync(absPath, { encoding: 'utf-8' });
      return acc;
    }, {} as Record<string, string>);
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

export async function prepareTestFiles(
  logger: TestLogger,
  testBasePath: string,
  executionBasePath: string,
  electronVersion: string,
  port: number,
  convertFilesToEsm: boolean,
): Promise<void> {
  const log = logger.createLogger('Prepare Test Files');

  const files = getFiles(testBasePath);

  // eslint-disable-next-line prefer-const
  for (let [filename, content] of Object.entries(files)) {
    log(`Writing file '${filename}'`);

    // Replace with the test server localhost DSN
    content = content
      .replace('__DSN__', `http://${SENTRY_KEY}@localhost:${port}/277345`)
      .replace('__INCORRECT_DSN__', `http://${SENTRY_KEY}@localhost:9999/277345`)
      .replace('__RATE_LIMIT_DSN__', `http://${SENTRY_KEY}@localhost:${port}/${RATE_LIMIT_ID}`)
      .replace('__ERROR_DSN__', `http://${SENTRY_KEY}@localhost:${port}/${ERROR_ID}`)
      .replace('__HANG_DSN__', `http://${SENTRY_KEY}@localhost:${port}/${HANG_ID}`);

    if (filename.endsWith('package.json')) {
      content = content
        // We replace the @sentry/electron dependency in package.json with the path to the tarball
        .replace(
          /"@sentry\/electron": ".*"/,
          `"@sentry/electron": "file:./../../../../sentry-electron-${SDK_VERSION}.tgz"`,
        )
        // We replace the Sentry JavaScript dependency versions to match that of @sentry/core
        .replace(/"@sentry\/replay": ".*"/, `"@sentry/replay": "${JS_SDK_VERSION}"`)
        .replace(/"@sentry\/react": ".*"/, `"@sentry/react": "${JS_SDK_VERSION}"`)
        .replace(/"@sentry\/node-native": ".*"/, `"@sentry/node-native": "${JS_SDK_VERSION}"`)
        .replace(/"@sentry\/profiling-node": ".*"/, `"@sentry/profiling-node": "${JS_SDK_VERSION}"`)
        .replace(/"@sentry\/integrations": ".*"/, `"@sentry/integrations": "${JS_SDK_VERSION}"`)
        .replace(/"@sentry\/vue": ".*"/, `"@sentry/vue": "${JS_SDK_VERSION}"`)
        .replace(/"electron": ".*"/, `"electron": "${electronVersion}"`);
    }

    if (convertFilesToEsm) {
      [filename, content] = convertToEsm(filename, content);
    }

    const path = join(executionBasePath, filename);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}

export async function installDepsAndBuild(
  logger: TestLogger,
  packageManager: 'npm' | 'yarn',
  executionBasePath: string,
  hasBuildScript: boolean,
): Promise<void> {
  const log = logger.createLogger('Prepare Test Env');

  log('Installing dependencies...');
  await exec(`${packageManager} install`, { cwd: executionBasePath });

  if (hasBuildScript) {
    log('Running build script...');
    await exec(`${packageManager} run build`, { cwd: executionBasePath });
  }
}
