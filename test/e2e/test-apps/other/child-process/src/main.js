const path = require('path');

const { app, BrowserWindow } = require('electron');
const { init, Integrations } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  integrations: [new Integrations.ChildProcess({ capture: ['killed'] })],
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

  setTimeout(() => {
    // kill the GPU process and it will be captured as an event
    const metrics = app.getAppMetrics();
    for (const metric of metrics) {
      if (metric.type === 'GPU') {
        process.kill(metric.pid);
      }
    }
  }, 1000);
});
