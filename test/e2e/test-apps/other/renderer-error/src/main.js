const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, logger } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  enableLogs: true,
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

  // Ensure we only quit once the browser SDK has sent its logs
  mainWindow.webContents.on('dom-ready', () => {
    setTimeout(() => {
      app.quit();
    }, 4000);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  logger.info('User profile updated', {
    userId: 'user_123',
    updatedFields: ['email', 'preferences'],
  });
});
