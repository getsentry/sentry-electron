const path = require('path');
const url = require('url');

const { app, BrowserWindow } = require('electron');

const { init } = require('../../../../../');

init({
  dsn: 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345',
  debug: true,
  onFatalError: (_error) => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
});

app.on('ready', () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (process.env.DEBUG) {
    window.webContents.on('console-message', (_, __, msg) => console.log(`Renderer: ${msg}`));
  }

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});
