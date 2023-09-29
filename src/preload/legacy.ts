/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 */

import { contextBridge, crashReporter, ipcRenderer } from 'electron';
import * as electron from 'electron';

import { IPCChannel } from '../common/ipc';

// eslint-disable-next-line no-restricted-globals
if (window.__SENTRY_IPC__) {
  // eslint-disable-next-line no-console
  console.log('Sentry Electron preload has already been run');
} else {
  crashReporter.start({
    companyName: '',
    ignoreSystemCrashHandler: true,
    // This script is only ever used for Electron < v9 where the remote module is available
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    productName: (electron as any).remote.app.name || (electron as any).remote.app.getName(),
    submitURL: '',
    uploadToServer: false,
  });

  const ipcObject = {
    sendScope: (scopeJson: string) => ipcRenderer.send(IPCChannel.SCOPE, scopeJson),
    sendEvent: (eventJson: string) => ipcRenderer.send(IPCChannel.EVENT, eventJson),
    sendEnvelope: (envelope: Uint8Array | string) => ipcRenderer.send(IPCChannel.ENVELOPE, envelope),
  };

  // eslint-disable-next-line no-restricted-globals
  window.__SENTRY_IPC__ = ipcObject;

  // We attempt to use contextBridge if it's available
  if (contextBridge) {
    // This will fail if contextIsolation is not enabled
    try {
      contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
    } catch (e) {
      //
    }
  }
}
