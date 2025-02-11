const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

app.commandLine.appendSwitch('enable-crashpad');

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

  setTimeout(() => {
    mainWindow.webContents.forcefullyCrashRenderer();
  }, 1000);
});
