const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, Integrations } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [new Integrations.BrowserWindowSession({ backgroundTimeoutSeconds: 1 })],
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  setTimeout(() => {
    mainWindow.blur();

    setTimeout(() => {
      mainWindow.focus();

      setTimeout(() => {
        app.quit();
      }, 2000);
    }, 2000);
  }, 2000);
});
