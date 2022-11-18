const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, configureScope } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

configureScope((scope) => {
  scope.setTag('app-run', process.env.APP_FIRST_RUN ? 'first' : 'second');
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

  // We only crash on the first run
  // The second run is where the crash is uploaded
  if (process.env.APP_FIRST_RUN) {
    setTimeout(() => {
      process.crash();
    }, 500);
  }
});
