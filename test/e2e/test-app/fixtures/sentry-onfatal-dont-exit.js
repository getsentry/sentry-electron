const { init, captureMessage } = require('../../../../');
const { app } = require('electron');

init({
  dsn: process.env.DSN,
  onFatalError: error => {
    // Do nothing
  },
});
