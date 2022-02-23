// eslint-disable-next-line import/order
const { app } = require('electron');

const Sentry = require('@sentry/electron');
require('@sentry/tracing');

Sentry.init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  tracesSampleRate: 1.0,
  onFatalError: () => {},
});

async function doTransaction() {
  const transaction = Sentry.startTransaction({ name: 'InitSequence', op: 'task' });
  const initializeServicesSpan = transaction.startChild({ op: 'initializeServices' });

  setTimeout(() => {
    initializeServicesSpan.finish();
    transaction.finish();
  }, 500);
}

app.on('ready', () => doTransaction());
