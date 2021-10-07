/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 *
 * npm script `build:preload` calls `node ./scripts/build-preload.js` which inlines ipc and transpiles to JavaScript
 */

import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../common/ipc';

const ipcObject = {
  sendScope: (scopeJson: string) => ipcRenderer.send(IPC.SCOPE, scopeJson),
  sendEvent: (eventJson: string) => ipcRenderer.send(IPC.EVENT, eventJson),
  getContext: (callback: (eventJson: string) => void) => {
    ipcRenderer.once(IPC.CONTEXT, (_, json) => callback(json));
    ipcRenderer.send(IPC.CONTEXT);
  },
};

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
