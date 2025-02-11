// eslint-disable-next-line import/order
const { app } = require('electron');

const Sentry = require('@sentry/electron/main');

Sentry.init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
  tracesSampleRate: 1.0,
  onFatalError: () => {},
});

async function doTransaction() {
  await Sentry.startSpan({ name: 'InitSequence', op: 'task' }, async () => {
    await Sentry.startSpan({ name: 'initializeServices' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
  });
}

app.on('ready', () => doTransaction());
