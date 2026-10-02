const path = require('path');

const { app, utilityProcess } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  release: 'some-release',
  onFatalError: () => {},
});

app.on('ready', () => {
  utilityProcess.fork(path.join(__dirname, 'utility.js'));
});
