const { configureScope } = require('../../../../../');
if (process.type === 'browser') {
  configureScope((scope) => {
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '5', email: 'none@test.org' });
    scope.setFingerprint(['abcd']);
    scope.setContext('server', { id: '2' });
  });
} else {
  setTimeout(() => {
    // There is no scope setup in the renderer process so this will cause empty scope to be sent to the main process
    console.log('logging so empty scope gets sent');

    setTimeout(() => {
      throw new Error('Error triggered in renderer');
    }, 50);
  }, 100);
}
