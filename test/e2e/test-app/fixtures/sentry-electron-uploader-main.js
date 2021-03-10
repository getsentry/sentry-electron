const { init, configureScope } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  debug: true,
  useCrashpadMinidumpUploader: true,
  useSentryMinidumpUploader: false,
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

if (process.type == 'browser') {
  configureScope(scope => scope.setUser({ id: 'ABCDEF1234567890' }));
}
