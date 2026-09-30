const { app } = require('electron');
const { trace } = require('@opentelemetry/api');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  enableOpenTelemetrySetup: true,
  onFatalError: () => {},
});

app.on('ready', () => {
  const tracer = trace.getTracer('test');

  tracer.startActiveSpan('otel-root', (root) => {
    tracer.startActiveSpan('otel-child', (child) => {
      child.end();
    });
    root.end();
  });

  setTimeout(() => app.quit(), 1000);
});
