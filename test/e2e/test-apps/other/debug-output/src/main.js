const { init } = require('@sentry/electron/main');
const { app } = require('electron');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
  onFatalError: () => {},
});

setTimeout(() => {
  app.quit();
}, 3000);
