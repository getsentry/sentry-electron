const { init, configureScope } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

configureScope(scope => {
  scope.setUser({ id: 'johndoe' });
});
