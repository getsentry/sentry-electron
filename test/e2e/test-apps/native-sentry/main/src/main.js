const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, getCurrentScope } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

getCurrentScope().setTag('app-run', process.env.APP_FIRST_RUN ? 'first' : 'second');

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
    console.log('main process breadcrumb from first crashing run');

    setTimeout(() => {
      process.crash();
    }, 2000);
  } else {
    console.log('main process breadcrumb from second run');
  }
});
