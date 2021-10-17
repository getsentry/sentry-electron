---
description: Native GPU Crash
category: Native (Electron Uploader)
command: 'yarn'
condition: version.major >= 13
---

`package.json`

```json
{
  "name": "native-electron-gpu",
  "version": "1.0.0",
  "main": "src/main.js",
  "dependencies": {
    "@sentry/electron": "3.0.0"
  }
}
```

`src/main.js`

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { init, Integrations } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  integrations: [new Integrations.ElectronMinidump()],
  initialScope: { user: { username: 'some_user' } },
  onFatalError: () => {},
});

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    show: false,
  });

  mainWindow.loadURL('chrome://gpucrash');
});
```

`event`

```json
{
  "method": "minidump",
  "namespacedData": {
    "initialScope": {
      "user": {
        "username": "some_user"
      }
    }
  },
  "sentryKey": "37f8a2ee37c0409d8970bc7559c7c7e4",
  "appId": "277345",
  "dumpFile": true,
  "data": {
    "event_id": "{{id}}",
    "timestamp": 0
  }
}
```
