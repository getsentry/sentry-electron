const path = require('path');

const { app, utilityProcess } = require('electron');
const { init } = require('@sentry/electron/main');

init({
  dsn: '__DSN__',
  debug: true,
  integrations: (integrations) => integrations.filter((i) => i.name !== 'MainProcessSession'),
  onFatalError: () => {},
});

app.on('ready', () => {
  const child = utilityProcess.fork(path.join(__dirname, 'utility.js'));

  child.on('message', () => {
    throw new Error('should not get any messages');
  });
});
