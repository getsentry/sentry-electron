import { ipcMain } from 'electron';

import { IPCChannel } from '../../common';
import { ElectronMainOptions } from '../sdk';
import { handleEvent, handleScope } from './common';

/**
 * Hooks IPC for communication with the renderer processes
 */
export function configure(options: ElectronMainOptions): void {
  ipcMain.on(IPCChannel.EVENT, ({ sender }, jsonEvent: string) => handleEvent(options, jsonEvent, sender));
  ipcMain.on(IPCChannel.SCOPE, (_, jsonScope: string) => handleScope(options, jsonScope));
}
