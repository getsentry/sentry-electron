const { app } = require('electron');

const { init } = require('../../../../../');

init({
  dsn: process.env.DSN,
  release: 'some-release',
  autoSessionTracking: true,
  debug: true,
  onFatalError: (_error) => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
});

setTimeout(() => {
  app.quit();
}, 2000);
