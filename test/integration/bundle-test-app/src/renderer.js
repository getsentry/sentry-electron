require('./sentry');

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
