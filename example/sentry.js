const { addBreadcrumb, init } = require('@sentry/electron');

init({
  dsn: 'https://37f8a2ee37c0409d8970bc7559c7c7e4@o19635.ingest.sentry.io/277345',
  debug: true,
  // useCrashpadMinidumpUploader: true,
  // useSentryMinidumpUploader: false,
});

addBreadcrumb({ message: 'test' });
