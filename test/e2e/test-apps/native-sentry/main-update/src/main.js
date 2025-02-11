const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  release: process.env.APP_FIRST_RUN ? 'native-sentry-main-update@1.0.0' : 'native-sentry-main-update@2.0.0',
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

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // We only crash on the first run
  // The second run is where the crash is uploaded
  if (process.env.APP_FIRST_RUN) {
    setTimeout(() => {
      process.crash();
    }, 1000);
  }
});
