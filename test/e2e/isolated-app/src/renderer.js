const { init, configureScope } = require('../../../..');

init({});

configureScope(scope => {
  scope.setUser({ id: 'abc-123' });
});

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
