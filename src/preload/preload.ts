console.log(process.argv);

if (process.platform !== 'darwin' && parseInt(process.versions.electron.split('.')[0]) < 9) {
  const { crashReporter, remote } = require('electron');
  crashReporter.start({
    companyName: '',
    ignoreSystemCrashHandler: true,
    productName: remote.app.getName(),
    submitURL: '',
    uploadToServer: false,
  });
}

const { contextBridge, ipcRenderer } = require('electron');

const ipcObject = {
  sendScope: (scopeJson: string) => ipcRenderer.send('sentry-electron.scope', scopeJson),
  sendEvent: (eventJson: string) => ipcRenderer.send('sentry-electron.event', eventJson),
};

window.__SENTRY_IPC__ = ipcObject;

// We attempt to use contextBridge if it's available (Electron >= 6)
if (contextBridge) {
  // This will fail if contextIsolation is not enabled
  try {
    contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
  } catch (e) {
    //
  }
}
