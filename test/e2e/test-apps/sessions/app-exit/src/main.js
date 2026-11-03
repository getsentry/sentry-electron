const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, mainProcessSessionIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [mainProcessSessionIntegration({ sendOnCreate: true })],
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});

// The first run exits via app.exit() which skips 'will-quit'
// The second run sends the previous session
setTimeout(() => {
  if (process.env.APP_FIRST_RUN) {
    app.exit();
  } else {
    app.quit();
  }
}, 4000);
