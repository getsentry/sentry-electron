const { init, flush, logger, metrics, startSpan } = require('@sentry/electron/utility');

init({
  debug: true,
  tracesSampleRate: 1,
});

setTimeout(() => {
  startSpan({ name: 'utility-span' }, () => {
    startSpan({ name: 'utility-child-span' }, () => {});
  });

  logger.info('utility log');
  metrics.count('utility.metric', 1);

  flush();
}, 1000);
