const Sentry = require('@sentry/core');
const { SentryElectron } = require('..');

const MY_DSN =
  process.env.DSN ||
  'https://37f8a2ee37c0409d8970bc7559c7c7e4:4cfde0ca506c4ea39b4e25b61a1ff1c3@sentry.io/277345';

Sentry.create(MY_DSN)
  .use(SentryElectron)
  .install();
