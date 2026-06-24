import { app, BrowserWindow } from 'electron';
import { init } from '@sentry/electron/main';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

init({
  dsn: '__DSN__',
  debug: true,
  onFatalError: () => {},
});

const createWindow = () => {
  const require = createRequire(import.meta.url);
  const squirrelStartup = require('electron-squirrel-startup');

  if (typeof squirrelStartup !== 'boolean') {
    throw new Error('createRequire package load returned an unexpected value');
  }

  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const rendererEntryPath = fileURLToPath(new URL('../renderer/index.html', import.meta.url));
  void mainWindow.loadFile(rendererEntryPath);

  setTimeout(() => {
    throw new Error('Some ESM main error');
  }, 500);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
