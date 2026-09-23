const { app } = require('electron');
const { init, startSpan, flush, graphqlIntegration } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  tracesSampleRate: 1,
  integrations: [graphqlIntegration()],
  onFatalError: () => {},
});

app.on('ready', async () => {
  // Require graphql *after* Sentry.init so orchestrion's loader hook - registered when the
  // NodeClient is constructed - can inject the diagnostics-channel instrumentation into it.
  const { graphql, buildSchema } = require('graphql');
  const schema = buildSchema('type Query { hello: String }');

  await startSpan({ name: 'orchestrion-graphql' }, async () => {
    await graphql({ schema, source: '{ hello }', rootValue: { hello: () => 'world' } });
  });

  await flush(2000);
  setTimeout(() => app.quit(), 1000);
});
