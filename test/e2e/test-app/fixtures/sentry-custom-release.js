const { init } = require('../../../../');

init({
  dsn: process.env.DSN,
  release: 'some-custom-release',
  onFatalError: error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});
