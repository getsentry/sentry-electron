/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 *
 * npm script `build:preload` calls `node ./scripts/build-preload.js` which inlines ipc and transpiles to JavaScript
 */

import { contextBridge, crashReporter, ipcRenderer } from 'electron';
import * as electron from 'electron';

import { IPC } from '../common/ipc';

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
  sendScope: (scopeJson: string) => ipcRenderer.send(IPC.SCOPE, scopeJson),
  sendEvent: (eventJson: string) => ipcRenderer.send(IPC.EVENT, eventJson),
  getContext: (callback: (eventJson: string) => void) => {
    ipcRenderer.once(IPC.CONTEXT, (_, json) => callback(json));
    ipcRenderer.send(IPC.CONTEXT);
  },
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
