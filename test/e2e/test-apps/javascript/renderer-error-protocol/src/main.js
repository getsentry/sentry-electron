const path = require('path');

const { app, BrowserWindow, protocol } = require('electron');
const { init, IPCMode } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  ipcMode: IPCMode.Protocol,
  autoSessionTracking: false,
  onFatalError: () => {},
});

// Since we patch registerSchemesAsPrivileged, this should not overwrite the sentry scheme
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'custom1',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

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
