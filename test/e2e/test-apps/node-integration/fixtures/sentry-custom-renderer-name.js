const { init } = require('../../../../../');

init({
  dsn: process.env.DSN,
  debug: true,
  onFatalError: (_error) => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
  getRendererName(_) {
    return 'SomeWindow';
  },
});
