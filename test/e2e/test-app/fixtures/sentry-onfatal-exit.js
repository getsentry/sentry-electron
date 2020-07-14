const { init } = require('../../../../');
const { app } = require('electron');

init({
  dsn: process.env.DSN,
  debug: true,
  onFatalError: error => {
    process.exit(1);
  },
});
