const { init, configureScope } = require('../../../../');

init({
  appName: 'test-app',
  release: 'some-release',
  dsn: process.env.DSN,
  debug: true,
  useCrashpadMinidumpUploader: true,
  useSentryMinidumpUploader: false,
  initialScope: { user: 'some_user' },
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

if (process.type == 'renderer') {
  configureScope(scope => scope.setUser({ id: 'ABCDEF1234567890' }));
}
