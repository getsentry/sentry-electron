const { app } = require('electron');
const { init, startSpan, captureException } = require('@sentry/electron/main');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  propagateTraceparent: true,
  onFatalError: () => {},
});

app.on('ready', async () => {
  try {
    await startSpan({ name: 'some-transaction' }, async () => {
      await fetch.default('http://localhost:8123/something');
    });
  } catch (e) {
    captureException(e);

    setTimeout(() => {
      app.quit();
    }, 1000);
  }
});
