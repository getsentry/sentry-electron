import { app } from 'electron';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { mkdirpSync } from '../fs';

// These keys get replaced with transpiled preload scripts via npm prebuild script
export const bundledCode = {
  'hook-ipc': `{{hook-ipc}}`,
  'start-native': `{{start-native}}`,
};

/**
 * Drops preload code into userData/sentry and gets the path
 */
export function dropPreloadAndGetPath(name: 'hook-ipc' | 'start-native'): string {
  const path = join(app.getPath('userData'), 'sentry', `${name}.js`);
  mkdirpSync(dirname(path));
  const code = bundledCode[name].replace('{{appName}}', app.getName());
  writeFileSync(path, code);
  return path;
}
