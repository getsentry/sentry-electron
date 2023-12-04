process.on('uncaughtException', () => {
  process.exit(1);
});

const { app } = require('electron');

app.getPath = () => {
  process.exit(1);
};

require('../../../main');

process.exit(0);
