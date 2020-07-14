const { init, configureScope } = require('../../../../');

init({
  dsn: process.env.DSN,
  onFatalError: error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

configureScope(scope => {
  scope.setUser({ id: 'johndoe' });
});
