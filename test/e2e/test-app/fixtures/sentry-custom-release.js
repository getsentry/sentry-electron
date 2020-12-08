const { init } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  debug: true,
  release: 'some-custom-release',
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});
