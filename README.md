
# JavaScript and native crash reporting from Electron to Sentry
### Breadcrumbs and JavaScript instrumentation for native crashes too!

Simply call `ElectronSentry.start()` as early as possible in the `main` AND `renderer` processes.

* Starts the Electron native [`crashReporter`](https://electronjs.org/docs/api/crash-reporter) in both processes and points it at the new [Sentry.io minidump endpoint](https://github.com/getsentry/sentry/pull/6416)
* Starts [`raven-js`](https://www.npmjs.com/package/raven-js) in the `renderer` process
  * Breadcrumbs and exceptions are passed to the main process. This means we can still report both if the renderer terminates due to a native crash.
  * Exception URLs are normalised to the app base so Sentry can group them correctly
    > **NOTE:** This normalisation only works with `asar` packaged apps!
* Starts [`raven-node`](https://www.npmjs.com/package/raven) in the `main` process
  * Hooks most `app`, `BrowserWindow`, `webContents`, `screen` and `powerMonitor` events and records breadcrumbs
  * Breadcrumbs from all processes are combined
  * If a render crashes due to a native exception, the native crash `id` is sent along with breadcrumbs so the two can be linked. Currently two errors are reported in Sentry and linking the two is manual.

**TODO**
* Offline support
* Spectron tests
* Better multiple renderer support?
  * Means to identify identify renderers
  * Keep breadcrumbs from different renderer separate

Import it like this:
```typescript
const { ElectronSentry } = require('electron-sentry');
// or
import { ElectronSentry } from 'electron-sentry';
```

If you don't supply any options, the `sentry` node in the root of your `package.json` is used. This can be your non-public DSN string or an options object (options and defaults at bottom).
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
There are some helpers available which check for, save and delete an empty file in `userData` to signify if reporting should be enabled or disabled. You can call these from either process but changes to the reporting state will not take effect until the app is restarted. This keeps things simple as the native reporter cannot be stopped once its started on Windows.
```typescript
if (ElectronSentry.isEnabled()) {
  ElectronSentry.start();
}

// Disable error reporting, I don't like to help devs...
ElectronSentry.setEnabled(false);
```

## Config & Defaults
```typescript
import { app } from 'electron';

const defaults = {
  // Sentry non-public DSN
  // We need the non-public one for raven-node
  dsn: string = undefined,

  // productName || appName from package.json
  // https://electronjs.org/docs/api/app#appgetname
  appName: string = app.getName(),

  // Defaults to the same as appName
  companyName: string: app.getName(),

  // Start the native crash reporter
  native: boolean = true,

  // Used by Sentry to identify this release
  // It's common to use git hashes but for Electron the
  // app version makes more sense
  release: string = app.getVersion(),

  // Environment string passed to Sentry
  // process.defaultApp is undefined when the app is packaged
  environment: string = process.defaultApp == undefined
                          ? 'production'
                          : 'development'

  // Extra tags passed through the crash reporters
  // Only first level properties make it through the native crash reporter
  tags: any = undefined
};
```

Example configuration in package.json
```json
{
  "name": "example-app",
  "displayName": "Example App",
  "version": "1.0.0",
  "sentry": {
    "dsn": "https://xxxxxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxx@sentry.io/xxxxxx",
    "native": false
    ...
  },
  "dependencies": {
    "sentry-electron": "^1.0.0"
  }
}
```
