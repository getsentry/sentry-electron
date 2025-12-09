const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, metrics } = require('@sentry/electron/main');

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

  mainWindow.webContents.on('dom-ready', () => {
    setTimeout(() => {
      app.quit();
    }, 4000);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  metrics.count('User profile updated', 1, {
    attributes: {
      userId: 'user_123',
      updatedFields: ['email', 'preferences'],
    },
  });
});
