const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
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

  mainWindow.webContents.on('dom-ready', () => {
    setTimeout(() => {
      mainWindow.minimize();

      setTimeout(() => {
        throw new Error('enough');
      }, 500);
    }, 500);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
