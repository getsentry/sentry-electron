const { app } = require('electron');
const { init } = require('@sentry/electron');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', () => {
  fetch.default('http://localhost:8123/something').then(() => {
    setTimeout(() => {
      setTimeout(() => {
        app.quit();
      }, 1000);

      throw new Error('Error after fetch');
    }, 3000);
  });
});
