const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');

require('./sentry');

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    // show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
  // We are quitting because we are only intesterst in startup
  setTimeout(() => app.quit(), 100);
});
