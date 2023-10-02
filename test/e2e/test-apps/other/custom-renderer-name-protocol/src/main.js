const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, IPCMode } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  ipcMode: IPCMode.Protocol,
  onFatalError: () => {},
  getRendererName(_) {
    return 'SomeWindow';
  },
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
