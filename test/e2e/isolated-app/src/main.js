const path = require('path');
const url = require('url');

const { app, BrowserWindow } = require('electron');

const { init } = require('../../../..');

init({
  dsn: 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345',
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  window.webContents.on('console-message', (_, __, message) => {
    console.log(message);
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});
