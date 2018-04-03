<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Electron (Beta)

[![Travis](https://img.shields.io/travis/getsentry/sentry-electron.svg?maxAge=2592000)](https://travis-ci.org/getsentry/sentry-electron)
[![AppVeyor](https://img.shields.io/appveyor/ci/sentry/sentry-electron.svg)](https://ci.appveyor.com/project/sentry/sentry-electron)
[![npm version](https://img.shields.io/npm/v/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)
[![license](https://img.shields.io/github/license/getsentry/sentry-electron.svg)](https://github.com/getsentry/sentry-electron/blob/master/LICENSE)

[![deps](https://david-dm.org/getsentry/sentry-electron/status.svg)](https://david-dm.org/getsentry/sentry-electron?view=list)
[![deps dev](https://david-dm.org/getsentry/sentry-electron/dev-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/sentry-electron/peer-status.svg)](https://david-dm.org/getsentry/sentry-electron?type=peer&view=list)

**NOTE**: This package is still in beta. It is part of an early access preview
for the
[next generation](https://github.com/getsentry/raven-js/tree/next#readme) of
Sentry JavaScript SDKs. While we try to keep breaking changes to a minimum,
interfaces might change between minor releases before the first stable `1.x`
release.

## Usage

To use this SDK, call `create(options)` as early as possible in the entry
modules in the main process as well as all renderer processes or further sub
processees you spawn. This will initialize the SDK and hook into the
environment. Note that you can turn off almost all side effects using the
respective options.

```javascript
import { create } from '@sentry/electron';

create({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of
`@sentry/electron`. Note that these functions will not perform any action before
you have called `create()`:

```javascript
import * as Sentry from '@sentry/electron';

// Set user information, as well as tags and further extras
Sentry.setExtraContext({ battery: 0.7 });
Sentry.setTagsContext({ user_mode: 'admin' });
Sentry.setUserContext({ id: '4711' });

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

## Advanced Usage

If you don't want to use a global static instance of Sentry, you can create one
yourself:

```javascript
import { ElectronFrontend } from '@sentry/electron';

const client = new ElectronFrontend({
  dsn: '__DSN__',
  // ...
});

client.install();
// ...
```
