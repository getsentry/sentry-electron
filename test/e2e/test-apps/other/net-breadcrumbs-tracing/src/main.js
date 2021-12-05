const { app } = require('electron');
const { init, startTransaction, getCurrentHub } = require('@sentry/electron');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', async () => {
  const transaction = startTransaction({ name: 'some-transaction' });
  getCurrentHub().configureScope((scope) => scope.setSpan(transaction));

  await fetch.default('http://localhost:8123/something');

  transaction.finish();

  setTimeout(() => {
    app.quit();
  }, 1000);
});
