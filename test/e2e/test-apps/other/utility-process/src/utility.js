const { init } = require('@sentry/electron/utility');

init({
  debug: true,
});

process.parentPort.on('message', () => {
  throw new Error('should get any massages');
});

setTimeout(() => {
  throw new Error('Some utility error');
}, 1000);
