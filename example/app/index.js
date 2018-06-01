// Activate the Sentry Electron SDK as early as possible in every process.
// The SDK must be installed in the main process for this to work.
require('../sentry');

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

window.versions = {
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  node: process.versions.node,
};
