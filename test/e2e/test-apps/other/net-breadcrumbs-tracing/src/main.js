const { app } = require('electron');
const { init, startTransaction, getCurrentHub } = require('@sentry/electron');
require('@sentry/tracing');
const fetch = require('electron-fetch');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  autoSessionTracking: false,
  onFatalError: () => {},
});

app.on('ready', () => {
  const transaction = startTransaction({ name: 'some-transaction' });
  getCurrentHub().configureScope((scope) => scope.setSpan(transaction));

  fetch.default('http://localhost:8123/something').then(() => {
    transaction.finish();

    setTimeout(() => {
      app.quit();
    }, 1000);
  });
});
