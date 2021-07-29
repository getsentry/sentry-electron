import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../ipc';

const ipcObject = {
  sendScope: (scopeJson: string) => ipcRenderer.send(IPC.SCOPE, scopeJson),
  sendEvent: (eventJson: string) => ipcRenderer.send(IPC.EVENT, eventJson),
};

window.__SENTRY_IPC__ = ipcObject;

// We attempt to use contextBridge if it's available (Electron >= 6)
if (contextBridge) {
  // This will fail if contextIsolation is not enabled
  try {
    contextBridge?.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
  } catch (e) {
    //
  }
}
