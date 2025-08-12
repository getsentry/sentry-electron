const { init, captureConsoleIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [captureConsoleIntegration({ levels: ['error'] })],
  onFatalError: () => {},
});

setTimeout(() => {
  const obj = { data: 1 };
  obj.self = obj;
  console.error(obj);
}, 2000);
