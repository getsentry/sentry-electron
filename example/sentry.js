const Sentry = require('@sentry/core');
const { SentryElectron } = require('..');

// TODO: Add your DSN here
const MY_DSN =
  'http://37f8a2ee37c0409d8970bc7559c7c7e4:4cfde0ca506c4ea39b4e25b61a1ff1c3@localhost:8000/277345';

Sentry.create(MY_DSN)
  .use(SentryElectron)
  .install();
