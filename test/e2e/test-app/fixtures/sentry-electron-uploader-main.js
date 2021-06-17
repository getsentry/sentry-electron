const { init } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  debug: true,
  useCrashpadMinidumpUploader: true,
  useSentryMinidumpUploader: false,
  initialScope: { user: 'some_user' },
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

if (process.type == 'browser') {
  configureScope(scope => scope.setUser({ id: 'ABCDEF1234567890' }));
}
