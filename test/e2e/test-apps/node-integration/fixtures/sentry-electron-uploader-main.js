const { init, configureScope, Integrations } = require('../../../../../');

init({
  dsn: process.env.DSN,
  release: 'some-release',
  debug: true,
  autoSessionTracking: false,
  integrations: [new Integrations.ElectronMinidump()],
  initialScope: { user: { username: 'some_user' } },
  onFatalError: () => {
    // We need this here otherwise we will get a dialog and CI will get stuck
  },
});

if (process.type == 'browser') {
  configureScope((scope) => scope.setUser({ id: 'ABCDEF1234567890' }));
}
