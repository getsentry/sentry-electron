const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, startupTracingIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  // The renderer keeps the pageload span open past the streaming flush interval so we need to
  // wait longer than the default 10 seconds
  integrations: [startupTracingIntegration({ timeoutSeconds: 20 })],
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
