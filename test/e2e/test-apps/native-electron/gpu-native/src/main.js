const { app, BrowserWindow } = require('electron');
const { init, Integrations } = require('@sentry/electron');

app.commandLine.appendSwitch('enable-crashpad');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  integrations: [new Integrations.ElectronMinidump()],
  initialScope: { user: { username: 'some_user' } },
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
  });

  mainWindow.loadURL('chrome://gpucrash');
});