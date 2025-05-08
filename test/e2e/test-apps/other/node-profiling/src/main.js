const path = require('path');
const crypto = require('crypto');

const { app, BrowserWindow } = require('electron');
const { init, startSpan } = require('@sentry/electron/main');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

init({
  dsn: '__DSN__',
  debug: true,
  release: 'some-release',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  onFatalError: () => {},
});

function pbkdf2() {
  return new Promise((resolve) => {
    const salt = crypto.randomBytes(128).toString('base64');
    crypto.pbkdf2('myPassword', salt, 10000, 512, 'sha512', resolve);
  });
}

async function longWork() {
  for (let i = 0; i < 10; i++) {
    await startSpan({ name: 'PBKDF2' }, async () => {
      await pbkdf2();
    });
  }
}

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
    startSpan({ name: 'Long work' }, async () => {
      await longWork();
    });
  }, 500);
});
