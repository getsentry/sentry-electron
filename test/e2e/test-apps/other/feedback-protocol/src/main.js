const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, IPCMode } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  // Bundled main processes cannot inject the preload. Protocol fetch is the supported fallback.
  ipcMode: IPCMode.Protocol,
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
