const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron');

init({
  dsn: '__HANG_DSN__',
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

  setTimeout(() => {
    console.log(`Listener count = ${mainWindow.webContents.listenerCount('destroyed')}`);
    app.quit();
  }, 8000);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
