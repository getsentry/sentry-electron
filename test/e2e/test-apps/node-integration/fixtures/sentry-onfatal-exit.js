// eslint-disable-next-line no-unused-vars
const { app } = require('electron');

const { init } = require('../../../../../');

init({
  dsn: process.env.DSN,
  debug: true,
  onFatalError: (_error) => {
    process.exit(1);
  },
});
