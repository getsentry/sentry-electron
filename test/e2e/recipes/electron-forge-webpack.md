---
description: Electron Forge Webpack with contextIsolation and sandbox
condition: 'version.major >= 6'
command: 'yarn && yarn package'
timeout: 120
---

`package.json`

```json
{
  "name": "electron-forge-webpack",
  "version": "1.0.0",
  "main": ".webpack/main",
  "scripts": {
    "package": "electron-forge package"
  },
  "config": {
    "forge": {
      "plugins": [
        [
          "@electron-forge/plugin-webpack",
          {
            "mainConfig": "./webpack.main.config.js",
            "renderer": {
              "config": "./webpack.renderer.config.js",
              "entryPoints": [
                {
                  "html": "./src/index.html",
                  "js": "./src/renderer.js",
                  "name": "main_window",
                  "preload": {
                    "js": "@sentry/electron/preload"
                  }
                }
              ]
            }
          }
        ]
      ]
    }
  },
  "devDependencies": {
    "@electron-forge/cli": "^6.0.0-beta.59",
    "@electron-forge/plugin-webpack": "6.0.0-beta.59",
    "@vercel/webpack-asset-relocator-loader": "1.6.0",
    "electron": "13.1.9",
    "node-loader": "^2.0.0"
  },
  "dependencies": {
    "@sentry/electron": "3.0.0",
    "electron-squirrel-startup": "^1.0.0"
  }
}
```

`webpack.main.config.js`

```js
module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.js',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
};
```

`webpack.renderer.config.js`

```js
const rules = require('./webpack.rules');

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
};
```

`webpack.rules.js`

```js
module.exports = [
  // Add support for native node modules
  {
    test: /\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
];
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
  </body>
</html>
```

`src/renderer.js`

```js
const { init } = require('@sentry/electron/renderer');

init({
  debug: true,
});

console.log('👋 This message is being logged by "renderer.js", included via webpack');

setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
```

`src/main.js`

```js
const { app, BrowserWindow } = require('electron');

const { init } = require('@sentry/electron/main');

init({
  dsn: 'http://37f8a2ee37c0409d8970bc7559c7c7e4@localhost:8123/277345',
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
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
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
        "app_name": "electron-forge-webpack",
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
        "crashed_url": "app:///.webpack/renderer/main_window/index.html"
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
                "filename": "app:///.webpack/renderer/main_window/index.js",
                "function": "{{function}}",
                "in_app": true,
                "lineno": 0
              },
              {
                "colno": 0,
                "filename": "app:///.webpack/renderer/main_window/index.js",
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
      "url": "app:///.webpack/renderer/main_window/index.html"
    }
  }
}
```
