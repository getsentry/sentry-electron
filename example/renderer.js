require('./sentry');

const { ipcRenderer } = require('electron');
const { crash } = global.process || {};

window.errorMain = () => {
  ipcRenderer.send('demo.error');
};

window.errorRenderer = () => {
  throw new Error('Error triggered in renderer process');
};

window.crashMain = () => {
  ipcRenderer.send('demo.crash');
};

window.crashRenderer = crash;
