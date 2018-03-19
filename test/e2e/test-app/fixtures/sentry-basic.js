const { SentryClient } = require('../../../../');

SentryClient.create({
  dsn: process.env.DSN,
});
