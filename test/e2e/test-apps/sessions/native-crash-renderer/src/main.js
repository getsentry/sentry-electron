const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
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

setTimeout(() => {
  app.quit();
}, 2000);
