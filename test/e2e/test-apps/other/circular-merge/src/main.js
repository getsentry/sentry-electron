const { init, captureConsoleIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: [captureConsoleIntegration({ levels: ['error'] })],
  onFatalError: () => {},
  // https://github.com/electron/electron/issues/49550
  beforeSend(event) {
    if (typeof event.extra.arguments[0] === 'string') {
      return null;
    }

    return event;
  },
});

setTimeout(() => {
  const obj = { data: 1 };
  obj.self = obj;
  console.error(obj);
}, 2000);
