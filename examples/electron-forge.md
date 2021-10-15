---
description: Electron Forge
command: 'yarn'
timeout: 120
---

`package.json`

```json
{
  "name": "electron-forge",
  "version": "1.0.0",
  "main": "src/index.js",
  "config": {
    "forge": {}
  },
  "dependencies": {
    "electron-squirrel-startup": "^1.0.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "^6.0.0-beta.59",
    "@sentry/electron": "3.0.0",
    "electron": "13.1.9"
  }
}
```

`src/index.js`

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { init } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
  onFatalError: () => {},
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

`src/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Hello World!</title>
  </head>
  <body>
    <h1>💖 Hello World!</h1>
    <p>Welcome to your Electron application.</p>
    <script>
      const { init } = require('@sentry/electron');

      init({
        debug: true,
      });

      setTimeout(() => {
        throw new Error('Some renderer error');
      }, 500);
    </script>
  </body>
</html>
```

`event`

```json
{
  "method": "envelope",
  "sentryKey": "37f8a2ee37c0409d8970bc7559c7c7e4",
  "appId": "277345",
  "dumpFile": false,
  "data": {
    "sdk": {
      "name": "sentry.javascript.electron",
      "packages": [
        {
          "name": "npm:@sentry/electron",
          "version": "{{version}}"
        }
      ],
      "version": "{{version}}"
    },
    "contexts": {
      "app": {
        "app_name": "electron-forge",
        "app_version": "1.0.0"
      },
      "browser": {
        "name": "Chrome"
      },
      "chrome": {
        "name": "Chrome",
        "type": "runtime",
        "version": "{{version}}"
      },
      "device": {
        "arch": "{{arch}}",
        "family": "Desktop"
      },
      "node": {
        "name": "Node",
        "type": "runtime",
        "version": "{{version}}"
      },
      "os": {
        "name": "{{platform}}",
        "version": "{{version}}"
      },
      "runtime": {
        "name": "Electron",
        "version": "{{version}}"
      },
      "electron": {
        "crashed_process": "WebContents[1]",
        "crashed_url": "app:///src/index.html"
      }
    },
    "environment": "production",
    "user": {
      "ip_address": "{{auto}}"
    },
    "exception": {
      "values": [
        {
          "type": "Error",
          "value": "Some renderer error",
          "stacktrace": {
            "frames": [
              {
                "colno": 0,
                "filename": "app:///src/index.html",
                "function": "{{function}}",
                "in_app": true,
                "lineno": 0
              }
            ]
          },
          "mechanism": {
            "handled": true,
            "type": "generic"
          }
        }
      ]
    },
    "level": "error",
    "event_id": "{{id}}",
    "platform": "javascript",
    "timestamp": 0,
    "breadcrumbs": [
      {
        "timestamp": 0,
        "category": "electron",
        "message": "app.will-finish-launching",
        "type": "ui"
      },
      {
        "timestamp": 0,
        "category": "electron",
        "message": "app.ready",
        "type": "ui"
      },
      {
        "timestamp": 0,
        "category": "electron",
        "message": "app.session-created",
        "type": "ui"
      },
      {
        "timestamp": 0,
        "category": "electron",
        "message": "app.web-contents-created",
        "type": "ui"
      },
      {
        "timestamp": 0,
        "category": "electron",
        "message": "app.browser-window-created",
        "type": "ui"
      },
      {
        "timestamp": 0,
        "category": "electron",
        "message": "WebContents[1].dom-ready",
        "type": "ui"
      }
    ],
    "request": {
      "url": "app:///src/index.html"
    },
    "tags": {
      "event.environment": "javascript",
      "event.origin": "electron",
      "event_type": "javascript"
    }
  }
}
```
