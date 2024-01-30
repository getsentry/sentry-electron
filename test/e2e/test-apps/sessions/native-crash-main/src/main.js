const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, mainProcessSessionIntegration } = require('@sentry/electron');

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

// We only crash on the first run
// The second run is where the crash is uploaded
setTimeout(() => {
  if (process.env.APP_FIRST_RUN) {
    process.crash();
  } else {
    app.quit();
  }
}, 4000);
