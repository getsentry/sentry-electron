const { init } = require('@sentry/electron');

init({
  debug: true,
});

setTimeout(() => {
  throw new Error('Some preload error');
}, 1000);
