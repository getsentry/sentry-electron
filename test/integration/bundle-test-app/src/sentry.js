const { init } = require('../../../../');

init({
  dsn: 'https://37f8a2ee37c0409d8970bc7559c7c7e4@o19635.ingest.sentry.io/277345',
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});
