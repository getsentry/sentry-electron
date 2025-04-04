const { app } = require('electron');
const { init, additionalContextIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => [
    additionalContextIntegration({ deviceModelManufacturer: true }),
    ...integrations.filter((i) => i.name !== 'MainProcessSession')
  ],
  onFatalError: () => {},
});

app.on('ready', () => {
  setTimeout(() => {
    throw new Error('Some main error');
  }, 500);
});
