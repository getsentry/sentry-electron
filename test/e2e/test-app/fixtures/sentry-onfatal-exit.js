const { SentryClient } = require('../../../../');
const { app } = require('electron');

SentryClient.create({
  dsn: process.env.DSN,
  onFatalError: (error) => {
    app.exit();
  }
});
