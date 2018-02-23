const Sentry = require('@sentry/core');
const { SentryElectron } = require('..');

// TODO: Add your DSN here
const MY_DSN = '';

Sentry.create(MY_DSN)
  .use(SentryElectron)
  .install();
