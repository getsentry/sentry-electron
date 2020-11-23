const path = require('path');
const url = require('url');
const fs = require('fs');

const { app, BrowserWindow } = require('electron');

fs.rmdirSync(path.join(app.getPath('userData'), 'sentry'), { recursive: true });

require('../test-app/setup-env');

const sentryPath = path.join(__dirname, '../test-app/fixtures/sentry-basic');
require(sentryPath);

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: sentryPath,
    },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});
