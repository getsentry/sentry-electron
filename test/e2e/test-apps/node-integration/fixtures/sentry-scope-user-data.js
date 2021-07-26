const { init, configureScope } = require('../../../../../');

init({
  dsn: process.env.DSN,
  onFatalError: (_error) => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
});

configureScope((scope) => {
  scope.setUser({ id: 'johndoe' });
});
