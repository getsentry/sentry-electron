// eslint-disable-next-line no-unused-vars
const { app } = require('electron');

const { init } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  debug: true,
  onFatalError: _error => {
    process.exit(1);
  },
});
