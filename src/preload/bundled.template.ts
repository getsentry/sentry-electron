import { app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';

// These keys get replaced with transpiled preload scripts via npm prebuild script
export const bundledCode = {
  'hook-ipc.js': `{{hook-ipc.js}}`,
  'start-native.js': `{{start-native.js}}`,
};

/**
 * Drops preload code into userData and gets the path
 */
export function dropPreloadAndGetPath(name: 'hook-ipc.js' | 'start-native.js'): string {
  const path = join(app.getPath('userData'), name);
  const code = bundledCode[name].replace('{{appName}}', app.getName());
  writeFileSync(path, code);
  return path;
}
