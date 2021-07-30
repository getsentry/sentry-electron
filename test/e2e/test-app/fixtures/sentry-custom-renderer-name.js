const { init } = require('../../../../');

init({
  dsn: process.env.DSN,
  debug: true,
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
  getRendererName(_) {
    return 'renderer';
  },
});
