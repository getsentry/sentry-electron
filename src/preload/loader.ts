import { app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';

import { hookIPC, startNative } from './bundled';

/**
 *
 */
export function hookIPCPath(): string {
  const path = join(app.getPath('userData'), 'hook-ipc.js');
  writeFileSync(path, hookIPC);
  return path;
}

/**
 *
 */
export function startNativePath(appName: string): string {
  const path = join(app.getPath('userData'), 'start-native.js');
  writeFileSync(path, startNative.replace('{{appName}}', appName));
  return path;
}
