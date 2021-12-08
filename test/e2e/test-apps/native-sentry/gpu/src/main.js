const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron');

app.commandLine.appendSwitch('enable-crashpad');

init({
  dsn: '__DSN__',
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

  setTimeout(() => {
    const crashWindow = new BrowserWindow({
      show: false,
    });

    crashWindow.loadURL('chrome://gpucrash');
  }, 500);
});
