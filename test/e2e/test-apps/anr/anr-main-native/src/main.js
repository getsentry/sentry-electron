// const crypto = require('crypto');

const { app } = require('electron');
const { init } = require('@sentry/electron/main');
const { eventLoopBlockIntegration } = require('@sentry/electron/native');
const { spawnSync } = require('child_process');

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

init({
  dsn: '__DSN__',
  debug: true,
  onFatalError: () => {},
  integrations: [eventLoopBlockIntegration()],
});

function longWork() {
  // for (let i = 0; i < 100; i++) {
  //   const salt = crypto.randomBytes(128).toString('base64');
  //   // eslint-disable-next-line no-unused-vars
  //   const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
  // }
  console.time('ping localhost');
  spawnSync('ping localhost', { shell: true, timeout: 10000 });
  console.timeEnd('ping localhost');
}

app.on('ready', () => {
  setTimeout(() => {
    longWork();
  }, 2000);
});
