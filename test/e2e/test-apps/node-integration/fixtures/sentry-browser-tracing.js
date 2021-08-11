if (process.type === 'browser') {
  const { init } = require('../../../../../main');

  init({
    dsn: process.env.DSN,
    release: 'some-release',
    debug: true,
    autoSessionTracking: false,
    onFatalError: (_error) => {
      // We need this here otherwise we will get a dialog and CI will get stuck
    },
  });
} else {
  const { init } = require('../../../../../renderer');
  const { Integrations } = require('@sentry/tracing');

  init({
    debug: true,
    integrations: [new Integrations.BrowserTracing()],
    tracesSampleRate: 1,
  });
}
