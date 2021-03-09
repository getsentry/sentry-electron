const { init, configureScope } = require('../../../../');

init({
  appName: 'test-app',
  dsn: process.env.DSN,
  debug: true,
  useCrashpadMinidumpUploader: scope => {
    const user = scope.getUser();
    return { user };
  },
  useSentryMinidumpUploader: false,
  onFatalError: _error => {
    // We need this here otherwise we will get a dialog and travis will be stuck
  },
});

if (process.type == 'renderer') {
  configureScope(scope => {
    scope.setUser({ id: 'renderer-abc123' });
  });
}
