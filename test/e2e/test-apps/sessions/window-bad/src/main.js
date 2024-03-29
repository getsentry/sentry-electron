const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, browserWindowSessionIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [browserWindowSessionIntegration({ backgroundTimeoutSeconds: 1 })],
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
    app.quit();
  }, 4000);
});
