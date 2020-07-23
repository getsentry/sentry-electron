const { configureScope, setUser } = require('../../../../');
if (process.type === 'browser') {
  configureScope(scope => {
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.setContext('server', { id: '2' });
  });
  setUser({ id: '2' });
  throw new Error('Error triggered in main process');
}
