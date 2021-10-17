---
description: Native Renderer Crash
category: Native (Electron Uploader)
command: 'yarn'
condition: version.major >= 9
---

`package.json`

```json
{
  "name": "native-electron-renderer",
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
```

`src/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <script>
      const { init } = require('@sentry/electron');

      init({
        debug: true,
      });

      setTimeout(() => {
        process.crash();
      }, 500);
    </script>
  </body>
</html>
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
