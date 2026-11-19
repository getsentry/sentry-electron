const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  dataCollection: { urlQueryParams: false },
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({ show: false });

  mainWindow.webContents.on('dom-ready', () => {
    fetch.default('http://localhost:8123/something?page=1#section').then(() => {
      setTimeout(() => {
        throw new Error('enough');
      }, 500);
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'), { query: { page: '2' }, hash: '/route' });
});
