const { app } = require('electron');
const { init } = require('@sentry/electron/main');

// Log errors rather than displaying dialog so we can compare the text in the test
process.on('uncaughtException', (e) => console.error(e));

app.on('ready', () => {
  init({
    dsn: '__DSN__',
    debug: true,
    integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
    onFatalError: () => { },
    // we don't want to send any events
    beforeSend: () => null,
  });
});

setTimeout(() => {
  process.exit();
}, 2000);
