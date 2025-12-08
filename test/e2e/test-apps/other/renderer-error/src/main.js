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

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  setTimeout(() => {
    logger.info('User profile updated', {
      userId: 'user_123',
      updatedFields: ['email', 'preferences'],
    });
  }, 4000);
});

setTimeout(() => {
  app.quit();
}, 10000);
