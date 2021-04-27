require('./sentry');
const { configureScope } = require('../../../..');

configureScope(scope => {
  scope.setUser({ id: 'abc-123' });
});

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
