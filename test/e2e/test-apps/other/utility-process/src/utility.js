const { init } = require('@sentry/electron/utility');

init({
  debug: true,
});

process.parentPort.on('message', () => {
  throw new Error('should get any massages');
});

setTimeout(() => {
  throw new Error('utility fail!');
}, 1000);
