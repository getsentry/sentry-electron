const path = require('path');
const child_process = require('child_process');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
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

  if (process.env.APP_FIRST_RUN) {
    child_process.fork(path.join(__dirname, 'child.js'));

    setTimeout(() => {
      app.exit();
    }, 3000);
  }
});
