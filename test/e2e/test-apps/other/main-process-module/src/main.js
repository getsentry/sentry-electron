import * as path from 'path';
import * as url from 'url';

import { app, BrowserWindow } from 'electron';
// eslint-disable-next-line import/no-unresolved
import { init } from '@sentry/electron';

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );

  setTimeout(() => {
    throw new Error('Some main error');
  }, 500);
});
