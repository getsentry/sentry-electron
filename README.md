<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Electron (Beta)

[![Travis](https://travis-ci.com/getsentry/sentry-electron.svg?branch=master)](https://travis-ci.com/getsentry/sentry-electron)
[![AppVeyor](https://img.shields.io/appveyor/ci/sentry/sentry-electron.svg)](https://ci.appveyor.com/project/sentry/sentry-electron)
[![npm version](https://img.shields.io/npm/v/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)
[![license](https://img.shields.io/github/license/getsentry/sentry-electron.svg)](https://github.com/getsentry/sentry-electron/blob/master/LICENSE)

[![deps](https://david-dm.org/getsentry/sentry-electron/status.svg)](https://david-dm.org/getsentry/sentry-electron?view=list)
[![deps dev](https://david-dm.org/getsentry/sentry-electron/dev-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/sentry-electron/peer-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=peer&view=list)

**NOTE**: This package is still in beta. It is part of an early access preview
for the
[next generation](https://github.com/getsentry/raven-js/tree/master/packages#readme) of
Sentry JavaScript SDKs. While we try to keep breaking changes to a minimum,
interfaces might change between minor releases before the first stable `1.x`
release.

## Features

* Captures **Node errors** in the main process (using
  [`@sentry/node`](https://github.com/getsentry/raven-js/tree/master/packages/node))
* Captures **JavaScript errors** in renderer processes (using
  [`@sentry/browser`](https://github.com/getsentry/raven-js/tree/master/packages/browser))
* Captures **native crashes** (Minidump crash reports) from renderers and the
  main process
* Collects **breadcrumbs and context** information along with events across
  renderers and the main process

## Usage

To use this SDK, call `init(options)` as early as possible in the entry modules
in the main process as well as all renderer processes or further sub processees
you spawn. This will initialize the SDK and hook into the environment. Note that
you can turn off almost all side effects using the respective options.

```javascript
import { init } from '@sentry/electron';

init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of
`@sentry/electron`. Note that these functions will not perform any action before
you have called `init()`:

```javascript
import * as Sentry from '@sentry/electron';

// Set user information, as well as tags and further extras
Sentry.configureScope(scope => {
  scope.setExtra('battery', 0.7);
  scope.setTag('user_mode', 'admin');
  scope.setUser({ id: '4711' });
  // scope.clear();
});

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

## Deep Dive

* [Configuration](https://docs.sentry.io/platforms/javascript/electron/#configuring-the-client)
* [JavaScript Usage](https://docs.sentry.io/platforms/javascript/electron/)
* [Native Usage](https://docs.sentry.io/platforms/javascript/electron/native/)
* [Source Maps](https://docs.sentry.io/platforms/javascript/electron/sourcemaps/)

## Resources

* [Releases](https://github.com/getsentry/sentry-electron/releases)
* [Bug Tracker](https://github.com/getsentry/sentry-electron/issues)
* [Example App](https://github.com/getsentry/sentry-electron/tree/master/example)
