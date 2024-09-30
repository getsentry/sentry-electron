const path = require('path');

const { app, utilityProcess } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  attachScreenshot: true,
  onFatalError: () => {},
});

app.on('ready', () => {
  const child = utilityProcess.fork(path.join(__dirname, 'utility.js'));

  child.on('message', () => {
    throw new Error('should not get any messages');
  });
});
