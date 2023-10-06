const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, enableAnrDetection } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

enableAnrDetection({
  mainProcess: false,
  rendererProcesses: { anrThreshold: 1000, captureStackTrace: true, debug: true },
}).then(() => {
  app.on('ready', () => {
    const mainWindow = new BrowserWindow({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  });
});
