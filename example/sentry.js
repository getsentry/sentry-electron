const { addBreadcrumb, init } = require('@sentry/electron');

init({
  dsn: 'https://37f8a2ee37c0409d8970bc7559c7c7e4@o19635.ingest.sentry.io/277345',
  // dsn: 'https://694d40391ed64847bfa90002ec7fbf32@o19635.ingest.sentry.io/277345', // Same project but 1 event / min rate limit
  // dsn: 'http://128fd56f467b4cc4ada2c51638cfdc11@relay-ja-689a42ff319b.eu.ngrok.io/3',
  debug: true,
  useCrashpadMinidumpUploader: true,
  useSentryMinidumpUploader: false,
});

addBreadcrumb({ message: 'test' });
