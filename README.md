> ## PLEASE NOTE: The minidump endpoint on hosted `sentry.io` is not yet live!

## JavaScript and native crash reporting from your Electron app to Sentry.

* In the `main` process it starts [`raven`](https://www.npmjs.com/package/raven)
* In the `renderer` process it starts [`raven-js`](https://www.npmjs.com/package/raven-js)
  * Exception URLs are normalised to the app base so Sentry can group them correctly
* In both processes it starts the Electron native [`crashReporter`](https://electronjs.org/docs/api/crash-reporter) and points it at the new [Sentry.io minidump endpoint](https://github.com/getsentry/sentry/pull/6416)

Simply call `ElectronSentry.start()` as early as possible in the `main` AND `renderer` processes.

If you dont start the error reporter in both processes, native error reporting will not work correctly on all platforms.
```typescript
const { ElectronSentry } = require('electron-sentry');

// If you don't supply your Sentry DSN, it looks for 'sentryDsn' in the
// root of your package.json
ElectronSentry.start();

// You can also pass the DSN string
ElectronSentry.start('https://xxxxxxx:xxxxxxx@sentry.io/xxxxx');

// Alternatively, you can pass options to start (see below for defaults)
ElectronSentry.start({
  dsn: 'https://xxxxxxx:xxxxxxx@sentry.io/xxxxx',
  native: false,
  // ...
});

// You can create your own instance
const instance = new ElectronSentry();
instance.start()
```


## Config & Defaults
```typescript
import { app } from 'electron';

const defaults = {
  // Sentry non-public DSN
  // We need the non-public one for raven-node
  dsn: string = undefined,

  // App name
  appName: string = app.getName(),

  // Company name
  companyName: string: app.getName(),

  // Start the native crash reporter
  native: boolean = true,

  // Used by Sentry to identify this release
  // It's common to use git hashes but the app version makes more
  // sense in Electron
  release: string = app.getVersion(),

  // Environment string passed to Sentry
  // process.defaultApp is undefined when the app is packaged
  environment: string = process.defaultApp == undefined ? 'production' : 'development',

  // Extra tags passed to the crash reporters
  // Only first level properties are passed through the native
  // crash reporter
  tags: any = undefined
};
```
