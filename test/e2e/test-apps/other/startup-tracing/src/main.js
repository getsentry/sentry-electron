const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, startupTracingIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  integrations: [startupTracingIntegration()],
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
