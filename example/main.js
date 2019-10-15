const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

const DIST_PATH = path.join(__dirname, 'dist');

// Activate the Sentry Electron SDK as early as possible in every process.
// To support errors in renderer processes on Linux and Windows, make sure
// to include this line in those files as well.
require('./sentry');

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(DIST_PATH, 'bundle.js'),
      sandbox: false,
    },
  });
  window.webContents.openDevTools();
  window.loadURL(
    url.format({
      pathname: path.join(DIST_PATH, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );
});

app.on('window-all-closed', () => app.quit());

// The IPC handlers below trigger errors in the here (main process) when
// the user clicks on corresponding buttons in the UI (renderer).
ipcMain.on('demo.error', () => {
  console.log('Error triggered in main processes');
  throw new Error('Error triggered in main processes');
});

ipcMain.on('demo.crash', () => {
  console.log('process.crash()');
  process.crash();
});
