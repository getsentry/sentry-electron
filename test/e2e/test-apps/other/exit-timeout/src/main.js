const { app } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__HANG_DSN__',
  debug: true,
  onFatalError: () => {},
});

app.on('ready', () => {
  setTimeout(() => {
    console.log('Some console output');
    app.quit();
  }, 3000);
});
