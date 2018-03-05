const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// If we're running e2e tests, use the supplied temp userData directory
if (process.env['E2E_USERDATA_DIRECTORY']) {
  app.setPath('userData', process.env['E2E_USERDATA_DIRECTORY']);
}

// Activate the Sentry Electron SDK as early as possible in every process.
// To support errors in renderer processes on Linux and Windows, make sure
// to include this line in those files as well.
require('../../../../example/sentry');

setTimeout(() => {
  throw new Error('Testing');
}, 2000);

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, '../../../../example/index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});
