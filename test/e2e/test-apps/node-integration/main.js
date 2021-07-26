const path = require('path');
const url = require('url');

const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('enable-crashpad');
app.setPath('userData', process.env['E2E_USERDATA_DIRECTORY']);

require('./load-sentry');

app.on('ready', () => {
  const window = new BrowserWindow({
    show: !!process.env.DEBUG,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    }),
  );

  if (process.env.DEBUG) {
    window.webContents.on('console-message', (_, __, msg) => console.log(`Renderer: ${msg}`));
  }

  require('./load-fixture');
});
