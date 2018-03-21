const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');

// If we're running e2e tests, use the supplied temp userData directory
if (process.env['E2E_USERDATA_DIRECTORY']) {
  app.setPath('userData', process.env['E2E_USERDATA_DIRECTORY']);
}

const sentryPath = path.join(__dirname, '../test-app/fixtures/sentry-basic')

require(sentryPath);

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: sentryPath,
      nodeIntegration: false
    }
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});

