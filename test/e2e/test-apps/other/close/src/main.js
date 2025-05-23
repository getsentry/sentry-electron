const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, close } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  onFatalError: () => {},
});

app.on('ready', () => {
  close().then(() => {
    const mainWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  });
});
