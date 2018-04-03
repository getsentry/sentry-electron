const { create, captureMessage } = require('../../../../');
const { app } = require('electron');

create({
  dsn: process.env.DSN,
  onFatalError: error => {
    app.exit();
  },
});
