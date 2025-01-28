const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, electronMinidumpIntegration } = require('@sentry/electron/main');

app.commandLine.appendSwitch('enable-crashpad');

init({
  dsn: '__DSN__',
  debug: true,
  release: 'custom-name',
  integrations: (integrations) => [...integrations.filter((i) => i.name !== 'MainProcessSession'), electronMinidumpIntegration()],
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
