const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, getCurrentScope } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

const scope = getCurrentScope();
scope.setExtra('some-extra', 'extra-value');
scope.setTag('a-tag', 'tag-value');
scope.setUser({ id: '1234567890' });

console.log('Some logging from the main process');

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
