// eslint-disable-next-line import/order
const { app } = require('electron');

// This is required because we can't deal with the error dialog in CI
global.process.on('uncaughtException', (error) => {
  console.log(error);
  app.quit();
});

const { init } = require('@sentry/electron/renderer');

init({
  dsn: '__DSN__',
  debug: true,
});
