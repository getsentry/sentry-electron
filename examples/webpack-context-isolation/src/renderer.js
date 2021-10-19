const { init, configureScope } = require('@sentry/electron/renderer');

init({
  debug: true,
});

configureScope((scope) => {
  scope.setUser({ id: 'abc-123' });
});

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);