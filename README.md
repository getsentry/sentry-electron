
## JavaScript and native crash reporting from your Electron app to Sentry.

* In the `main` process it starts [`raven`](https://www.npmjs.com/package/raven)
* In the `renderer` process it starts [`raven-js`](https://www.npmjs.com/package/raven-js)
  * Exception URLs are normalised to the app base so Sentry can group them correctly
* In both processes it starts the Electron native [`crashReporter`](https://electronjs.org/docs/api/crash-reporter) and points it at the new [Sentry.io minidump endpoint](https://github.com/getsentry/sentry/pull/6416)

Simply call `ElectronSentry.start()` as early as possible in the `main` AND `renderer` processes. If you dont start the error reporter in both processes, native error reporting will not work correctly on all platforms.

Import it like this:
```typescript
const { ElectronSentry } = require('electron-sentry');
// or
import { ElectronSentry } from 'electron-sentry';
```

If you don't supply any options, the `sentry` node in the root of your package.json is used. This can be either your non-public DSN string or an options object (options and defaults at bottom).
```typescript
ElectronSentry.start();
// or
ElectronSentry.start('https://xxxxxxx:xxxxxxx@sentry.io/xxxxx');
// or
ElectronSentry.start({
  dsn: 'https://xxxxxxx:xxxxxxx@sentry.io/xxxxx',
  native: false,
  // ...
});
```
There are some helpers available which check for, save and delete an empty file to signify if reporting should be enabled or disabled. You can call these from either process but changes to the reporting state will not take effect until the app is restarted.
```typescript
if (ElectronSentry.isEnabled()) {
  ElectronSentry.start();
}

// Disable error reporting, I don't like it when software improves.
ElectronSentry.setEnabled(false);
```

## Config & Defaults
```typescript
import { app } from 'electron';

const defaults = {
  // Sentry non-public DSN
  // We need the non-public one for raven-node
  dsn: string = undefined,

  // productName or appName from package.json
  appName: string = app.getName(),

  // productName or appName from package.json
  companyName: string: app.getName(),

  // Start the native crash reporter
  native: boolean = true,

  // Used by Sentry to identify this release
  // It's common to use git hashes but the app version
  // makes more sense in Electron
  release: string = app.getVersion(),

  // Environment string passed to Sentry
  // process.defaultApp is undefined when the app is packaged
  environment: string = process.defaultApp == undefined
                          ? 'production'
                          : 'development',

  // Extra tags passed through the crash reporters
  // Only first level properties make it through the native crash reporter
  tags: any = undefined
};
```

Example package.json
```json
{
  "name": "example-app",
  "displayName": "Example App",
  "version": "1.0.0",
  "sentry": {
    "dsn": "https://xxxxxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxx@sentry.io/xxxxxx",
    "native": false
  },
  "dependencies": {
    "sentry-electron": "^1.0.0"
  }
}
```
