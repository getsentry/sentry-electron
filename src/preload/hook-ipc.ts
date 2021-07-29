import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../ipc';

const ipcObject = {
  sendScope: (scopeJson: string) => ipcRenderer.send(IPC.SCOPE, scopeJson),
  sendEvent: (eventJson: string) => ipcRenderer.send(IPC.EVENT, eventJson),
  pingMain: (success: () => void) => {
    ipcRenderer.once(IPC.PING, () => {
      success();
    });
    ipcRenderer.send(IPC.PING);
  },
};

window.__SENTRY_IPC__ = ipcObject;

// We attempt to use contextBridge if it's available (Electron >= 6)
if (contextBridge) {
  // This will fail if contextIsolation is not enabled but we have no other way to detect this from the preload
  try {
    contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
  } catch (e) {
    //
  }
}
