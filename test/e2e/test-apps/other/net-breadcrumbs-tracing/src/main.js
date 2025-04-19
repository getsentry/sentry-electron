const { app } = require('electron');
const { flush, init, startSpan } = require('@sentry/electron/main');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  onFatalError: () => {},
});

app.on('ready', async () => {
  await startSpan({ name: 'some-transaction' }, async () => {
    await fetch.default('http://localhost:8123/something');
  });

  await flush();

  setTimeout(() => {
    app.quit();
  }, 1000);
});
