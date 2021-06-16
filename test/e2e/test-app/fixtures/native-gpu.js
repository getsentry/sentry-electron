if (process.type === 'browser') {
  const { BrowserWindow } = require('electron');

  const window = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
  });

  window.loadURL('chrome://gpucrash');

  setTimeout(() => {
    process.exit();
  }, 5000);
}
