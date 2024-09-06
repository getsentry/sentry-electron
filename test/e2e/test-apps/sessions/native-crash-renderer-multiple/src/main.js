const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, mainProcessSessionIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [mainProcessSessionIntegration({ sendOnCreate: true })],
  onFatalError: () => {},
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.on('ready', () => {
  createWindow();
});

setTimeout(() => {
  createWindow();
}, 3000);

setTimeout(() => {
  app.quit();
}, 10000);
