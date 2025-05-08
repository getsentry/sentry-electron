const path = require('path');
const child_process = require('child_process');

const { getPath } = require('crashy-cli');
const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

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

  if (process.env.APP_FIRST_RUN) {
    try {
      child_process.execSync(getPath());
    } catch (_) {
      //
    }

    setTimeout(() => {
      app.exit();
    }, 3000);
  }
});
