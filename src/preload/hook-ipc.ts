import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../ipc';

/** Timeout used for registering with the main process. */
const PING_TIMEOUT = 500;

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
  // This will fail if contextIsolation is not enabled but we have no other way to detect this from the renderer
  try {
    contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
  } catch (e) {
    //
  }
}

// Checks if the main processes is available and logs a warning if not.
setTimeout(() => {
  const timeout = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.warn('Could not connect to Sentry main process. Did you call init in the Electron main process?');
  }, PING_TIMEOUT);

  window.__SENTRY_IPC__?.pingMain(() => clearTimeout(timeout));
}, PING_TIMEOUT);
