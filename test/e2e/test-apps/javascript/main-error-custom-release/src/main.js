const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  release: 'custom-name',
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

  setTimeout(() => {
    throw new Error('Some main error');
  }, 500);
});
