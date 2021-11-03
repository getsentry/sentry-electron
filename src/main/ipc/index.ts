import { SentryError } from '@sentry/utils';
import { IPCMode } from '../../common';
import { supportsFullProtocol } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';
import { configure as configureClassic } from './classic';
import { configure as configureProtocol } from './protocol';

/** Sets up communication channels with the renderer */
export function configureIPC(options: ElectronMainOptions): void {
  if (!supportsFullProtocol() && options.ipcMode === IPCMode.Protocol) {
    throw new SentryError('IPCMode.Protocol is only supported in Electron >= v5');
  }

  // eslint-disable-next-line no-bitwise
  if (supportsFullProtocol() && (options.ipcMode & IPCMode.Protocol) > 0) {
    configureProtocol(options);
  }

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Classic) > 0) {
    configureClassic(options);
  }
}
