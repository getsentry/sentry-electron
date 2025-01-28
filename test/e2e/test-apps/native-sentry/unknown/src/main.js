const path = require('path');
const { writeFileSync } = require('fs');

const { app, BrowserWindow } = require('electron');
const { init, getCurrentScope } = require('@sentry/electron/main');

app.commandLine.appendSwitch('enable-crashpad');

const VALID_LOOKING_MINIDUMP = Buffer.from(`MDMP${'X'.repeat(12000)}`);

const minidumpPath = path.join(
  app.getPath('crashDumps'),
  process.platform === 'win32' ? 'reports' : 'completed',
  '0dc9e285-df8d-47b7-8147-85308b54065a.dmp'
);

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
  onFatalError: () => {},
});

getCurrentScope().setTag('app-run', process.env.APP_FIRST_RUN ? 'first' : 'second');

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
    console.log('main process breadcrumb from first crashing run');

    setTimeout(() => {
      writeFileSync(minidumpPath, VALID_LOOKING_MINIDUMP);

      setTimeout(() => {
        process.exit();
       });
    }, 2000);
  } else {
    console.log('main process breadcrumb from second run');
  }
});
