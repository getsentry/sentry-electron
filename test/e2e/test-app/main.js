const path = require('path');
const url = require('url');

const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('enable-crashpad');

require('./setup-env');
require('./load-sentry');

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );

  require('./load-fixture');
});
