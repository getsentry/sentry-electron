// eslint-disable-next-line import/no-unresolved
const { init, IPCMode } = require('@sentry/electron/main');
const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');

init({
  dsn: '__DSN__',
  debug: true,
  ipcMode: IPCMode.Classic,
  onFatalError: () => {},
});

app.on('ready', () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'dist', 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});
