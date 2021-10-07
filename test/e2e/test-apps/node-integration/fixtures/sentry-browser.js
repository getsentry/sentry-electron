if (process.type === 'browser') {
  const { init } = require('../../../../../main');

  init({
    dsn: process.env.DSN,
    debug: true,
    autoSessionTracking: false,
    onFatalError: (_error) => {
      // We need this here otherwise we will get a dialog and CI will get stuck
    },
  });
} else {
  const { init, Integrations } = require('../../../../../renderer');
  const { defaultIntegrations } = require('@sentry/browser');

  init({
    dsn: process.env.DSN,
    debug: true,
    defaultIntegrations: defaultIntegrations,
    integrations: [new Integrations.RendererContext()],
  });
}
