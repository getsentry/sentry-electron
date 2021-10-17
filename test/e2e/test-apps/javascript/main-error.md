---
description: JavaScript Main Error
category: JavaScript
command: 'yarn'
---

`package.json`

```json
{
  "name": "javascript-main",
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
const { init } = require('@sentry/electron');

init({
  dsn: '__DSN__',
  debug: true,
  autoSessionTracking: false,
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

  setTimeout(() => {
    throw new Error('Some main error');
  }, 500);
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
        "app_name": "javascript-main",
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
        "crashed_process": "browser"
      }
    },
    "release": "javascript-main@1.0.0",
    "environment": "production",
    "user": {
      "ip_address": "{{auto}}"
    },
    "exception": {
      "values": [
        {
          "type": "Error",
          "value": "Some main error",
          "stacktrace": {
            "frames": [
              {
                "colno": 0,
                "filename": "app:///src/main.js",
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
    "level": "fatal",
    "event_id": "{{id}}",
    "platform": "node",
    "timestamp": 0,
    "breadcrumbs": [
      {
        "category": "electron",
        "message": "app.will-finish-launching",
        "timestamp": 0,
        "type": "ui"
      },
      {
        "category": "electron",
        "message": "app.ready",
        "timestamp": 0,
        "type": "ui"
      },
      {
        "category": "electron",
        "message": "app.web-contents-created",
        "timestamp": 0,
        "type": "ui"
      },
      {
        "category": "electron",
        "message": "app.browser-window-created",
        "timestamp": 0,
        "type": "ui"
      },
      {
        "category": "electron",
        "message": "WebContents[1].dom-ready",
        "timestamp": 0,
        "type": "ui"
      }
    ],
    "tags": {
      "event.environment": "javascript",
      "event.origin": "electron",
      "event_type": "javascript"
    }
  }
}
```
