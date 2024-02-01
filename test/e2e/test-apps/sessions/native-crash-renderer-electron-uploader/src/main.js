const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, mainProcessSessionIntegration, electronMinidumpIntegration } = require('@sentry/electron/main');

app.commandLine.appendSwitch('enable-crashpad');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (defaults) => [
    electronMinidumpIntegration(),
    mainProcessSessionIntegration({ sendOnCreate: true }),
    ...defaults,
  ],
  initialScope: { user: { username: 'some_user' } },
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

setTimeout(() => {
  app.quit();
}, 6000);
