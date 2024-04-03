const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: process.env.APP_FIRST_RUN ? '__RATE_LIMIT_DSN__' : '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', () => {
  if (process.env.APP_FIRST_RUN) {
    setTimeout(() => {
      app.quit();
    }, 5000);
  }

  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
