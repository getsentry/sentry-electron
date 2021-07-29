import { app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';

import { hookIPC, startNative } from './bundled';

/**
 * Get the path to the hook-ipc.js preload script
 */
export function getHookIPC(): string {
  const path = join(app.getPath('userData'), 'hook-ipc.js');
  writeFileSync(path, hookIPC);
  return path;
}

/**
 * Get the path to the start_native.js preload script
 */
export function getStartNative(appName: string): string {
  const path = join(app.getPath('userData'), 'start-native.js');
  writeFileSync(path, startNative.replace('{{appName}}', appName));
  return path;
}
