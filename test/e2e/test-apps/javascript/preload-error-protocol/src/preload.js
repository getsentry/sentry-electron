const { init } = require('@sentry/electron/renderer');

init({
  debug: true,
});

setTimeout(() => {
  throw new Error('Some preload error');
}, 1000);
