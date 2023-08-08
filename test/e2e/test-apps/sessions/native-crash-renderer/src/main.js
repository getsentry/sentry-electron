const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, Integrations } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [new Integrations.MainProcessSession({ sendOnCreate: true })],
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
});

setTimeout(() => {
  app.quit();
}, 4000);
