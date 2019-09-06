const { init } = require('@sentry/electron');

init({
  // TODO: Replace with your project's DSN
  dsn: 'https://db2f4ea579c14e009b642370b62c2a6d@dgriesser-7b0957b1732f38a5e205.eu.ngrok.io/12',
  debug: true,
});
