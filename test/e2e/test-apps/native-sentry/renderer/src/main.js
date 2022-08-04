const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron');

init({
  dsn: 'https://233a45e5efe34c47a3536797ce15dafa@o447951.ingest.sentry.io/5650507',
  debug: true,
  autoSessionTracking: false,
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
