const { init, captureMessage } = require('../../../../');
const { app } = require('electron');

init({
  dsn: process.env.DSN,
  integrations: integrations =>
    integrations.filter(
      integration => integration.name !== 'OnUncaughtException',
    ),
});
