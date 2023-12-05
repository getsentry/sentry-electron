const { app } = require('electron');

process.on('uncaughtException', () => {
  app.exit(1);
});

app.getPath = () => {
  app.exit(1);
};

require('../../../main');

app.exit(0);
