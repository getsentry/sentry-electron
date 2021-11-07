const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, IPCMode } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  ipcMode: IPCMode.Protocol,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
