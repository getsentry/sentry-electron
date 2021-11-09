const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, Integrations } = require('@sentry/electron');

app.commandLine.appendSwitch('enable-crashpad');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (defaults) => [new Integrations.ElectronMinidump(), ...defaults],
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

// We only exit abnormally on the first run
// The second run is where the session is uploaded
if (process.env.APP_FIRST_RUN) {
  setTimeout(() => {
    process.exit();
  }, 1000);
} else {
  setTimeout(() => {
    app.quit();
  }, 2000);
}
