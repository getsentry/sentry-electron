const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, browserWindowSessionIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [browserWindowSessionIntegration({ backgroundTimeoutSeconds: 1 })],
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // Windows CI runners don't always activate a programmatically shown window,
  // so focus explicitly to ensure the session integration sees a focused window.
  mainWindow.focus();

  setTimeout(() => {
    mainWindow.hide();

    // Wait longer than backgroundTimeoutSeconds (1s) so the first session has
    // reliably ended before we show the window again and start a second one.
    setTimeout(() => {
      mainWindow.show();
      mainWindow.focus();

      setTimeout(() => {
        app.quit();
      }, 2000);
    }, 3000);
  }, 2000);
});
