const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, rendererEventLoopBlockIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [rendererEventLoopBlockIntegration({ injectDocumentPolicy: true })],
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
