const { init } = require('..');

// TODO: Replace with your project's DSN
const MY_DSN =
  'https://37f8a2ee37c0409d8970bc7559c7c7e4:4cfde0ca506c4ea39b4e25b61a1ff1c3@sentry.io/277345';

init({
  dsn: MY_DSN,
  // TODO: Add more options
});
