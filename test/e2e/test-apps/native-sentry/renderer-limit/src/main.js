const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, sentryMinidumpIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => [
    ...integrations.filter((i) => i.name !== 'MainProcessSession'),
    sentryMinidumpIntegration({ maxMinidumpsPerSession: 1 })
  ],
  onFatalError: () => { },
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

  // Keep reloading the window to cause multiple crash events
  app.on('render-process-gone', () => {
    console.log('Reloading window');
    mainWindow.reload();
  });
});
