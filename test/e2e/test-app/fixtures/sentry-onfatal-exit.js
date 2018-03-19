const { SentryClient } = require('../../../../');
const { app } = require('electron');

SentryClient.create({
  dsn: process.env.DSN,
  onFatalError: (error) => {
    SentryClient.captureException(error)
      .then(() => {
        app.exit();
      });
  }
});
