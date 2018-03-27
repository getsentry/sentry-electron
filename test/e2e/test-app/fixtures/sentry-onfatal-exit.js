const { create, captureException } = require('../../../../');
const { app } = require('electron');

create({
  dsn: process.env.DSN,
  onFatalError: error => {
    captureException(error).then(() => {
      app.exit();
    });
  },
});
