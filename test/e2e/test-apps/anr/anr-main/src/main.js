const crypto = require('crypto');

const { app } = require('electron');
const { init, enableMainProcessAnrDetection } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  onFatalError: () => {},
});

function longWork() {
  for (let i = 0; i < 100; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    // eslint-disable-next-line no-unused-vars
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
  }
}

enableMainProcessAnrDetection({ anrThreshold: 1000, captureStackTrace: true }).then(() => {
  app.on('ready', () => {
    setTimeout(() => {
      longWork();
    }, 1000);
  });
});
