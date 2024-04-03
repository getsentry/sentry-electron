const { app } = require('electron');
const { init } = require('@sentry/electron/main');

// Log errors rather than displaying dialog so we can compare the text in the test
process.on('uncaughtException', (e) => console.error(e));

app.on('ready', () => {
  init({
    dsn: '__DSN__',
    debug: true,
    autoSessionTracking: false,
    onFatalError: () => {},
  });
});

setTimeout(() => {
  process.exit();
}, 2000);
