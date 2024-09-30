const { init } = require('@sentry/electron/main');
const { app } = require('electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

setTimeout(() => {
  app.quit();
}, 3000);
