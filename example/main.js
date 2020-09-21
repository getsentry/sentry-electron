const path = require('path');
const url = require('url');

require('./sentry');

const { app, BrowserWindow, ipcMain } = require('electron');

const DIST_PATH = path.join(__dirname, 'dist');

app.on('ready', () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    // show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
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
