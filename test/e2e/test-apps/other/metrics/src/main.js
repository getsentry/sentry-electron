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

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  setTimeout(() => {
    metrics.count('User profile updated', 1, {
      attributes: {
        userId: 'user_123',
        updatedFields: ['email', 'preferences'],
      },
    });
  }, 500);
});

setTimeout(() => {
  app.quit();
}, 4000);
