// Activate the Sentry Electron SDK as early as possible in every process.
// The SDK must be installed in the main process for this to work.
require('./sentry');

const { ipcRenderer } = require('electron');

document.querySelector('#error-main').addEventListener('click', () => {
  ipcRenderer.send('demo.error');
});

document.querySelector('#error-render').addEventListener('click', () => {
  throw new Error('Error triggered in renderer process');
});

document.querySelector('#crash-main').addEventListener('click', () => {
  ipcRenderer.send('demo.crash');
});

document.querySelector('#crash-render').addEventListener('click', () => {
  process.crash();
});
