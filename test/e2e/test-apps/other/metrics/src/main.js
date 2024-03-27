const path = require('path');

const { app, BrowserWindow } = require('electron');
const Sentry = require('@sentry/electron/renderer');

Sentry.init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

Sentry.metrics.gauge('parallel_requests', 2, { tags: { type: 'a' } });

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  setTimeout(() => {
    Sentry.flush(2000);
  }, 2000);
});
