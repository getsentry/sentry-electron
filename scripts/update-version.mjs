import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default function () {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json')));

  // SDK_VERSION to 'src/main/version.ts'
  const versionPath = join(__dirname, '../src/main/version.ts');
  writeFileSync(versionPath, `export const SDK_VERSION = '${packageJson.version}';\n`);

  // Write @sentry/core version into options variable name so TypeScript error includes useful hint
  const coreVersion = packageJson.dependencies['@sentry/core'];
  const coreVersionVar = coreVersion.replace(/[\.-]/g, '_');
  const rendererSdkPath = join(__dirname, '../src/renderer/sdk.ts');
  let rendererSdk = readFileSync(rendererSdkPath, { encoding: 'utf8' });
  rendererSdk = rendererSdk.replace(/version_v\d+_\d+_\d+[a-z_0-9]*/, `version_v${coreVersionVar}`);
  writeFileSync(rendererSdkPath, rendererSdk);
}
