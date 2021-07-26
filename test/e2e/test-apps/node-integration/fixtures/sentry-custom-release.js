const { init } = require('../../../../../');

init({
  dsn: process.env.DSN,
  debug: true,
  release: 'some-custom-release',
  onFatalError: (_error) => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
});
