const { addBreadcrumb, init } = require('@sentry/electron');

init({
  // dsn: 'https://37f8a2ee37c0409d8970bc7559c7c7e4@o19635.ingest.sentry.io/277345',
  // dsn: 'https://694d40391ed64847bfa90002ec7fbf32@o19635.ingest.sentry.io/277345', // Same project but 1 event / min rate limit
  dsn: 'https://363cb47fc0b74130a94f14aaaf400041@o19635.ingest.sentry.io/5338414', // abhi-test-project
  debug: true,
  tracesSampleRate: 1,
  // useCrashpadMinidumpUploader: true,
  // useSentryMinidumpUploader: false,
});

addBreadcrumb({ message: 'test' });
