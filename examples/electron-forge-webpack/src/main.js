const { app, BrowserWindow } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      // eslint-disable-next-line no-undef
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // eslint-disable-next-line no-undef
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
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
