<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Electron

[![Build &
Test](https://github.com/getsentry/sentry-electron/actions/workflows/build.yml/badge.svg)](https://github.com/getsentry/sentry-electron/actions/workflows/build.yml)
[![Documentation](https://img.shields.io/badge/documentation-sentry.io-green.svg)](https://docs.sentry.io/platforms/javascript/electron/)
[![npm version](https://img.shields.io/npm/v/@sentry/electron.svg)](https://www.npmjs.com/package/@sentry/electron)
[![license](https://img.shields.io/github/license/getsentry/sentry-electron.svg)](https://github.com/getsentry/sentry-electron/blob/master/LICENSE)
[![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/SugnmRwkmV)

## Features

- Captures **Node errors** in the main process (using
  [`@sentry/node`](https://github.com/getsentry/sentry-javascript/tree/master/packages/node))
- Captures **JavaScript errors** in renderer processes (using
  [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser))
- Captures **native crashes** (Minidump crash reports) from renderers and the main process
- Collects **breadcrumbs and context** information along with events across renderers and the main process
- Supports `electron >= v23`

## Usage

To use this SDK, call `init(options)` as early as possible in the entry modules in the main process as well as all
renderer processes or further sub processes you spawn. This will initialize the SDK and hook the environment.

In the Electron main process:
```javascript
import { init } from '@sentry/electron/main';

init({
  dsn: '__DSN__',
  // ...
});
```

In all Electron renderer processes:
```javascript
// In the Electron renderer processes
import { init } from '@sentry/electron/renderer';

init();
```

If you are using a framework specific Sentry SDK, you can pass that `init` function as the second parameter in the
renderer and the two SDKs functionalities will be combined:
```javascript
import { init } from '@sentry/electron/renderer';
import { init as reactInit } from '@sentry/react';

init({ /* config */ }, reactInit);

```

To set context information or send manual events, use the exported functions of `@sentry/electron`. Note that these
functions will not perform any action before you have called `init()`:

```javascript
import * as Sentry from '@sentry/electron/main';

// Set user information, as well as tags and further extras
const scope = Sentry.getCurrentScope();
scope.setExtra('battery', 0.7);
scope.setTag('user_mode', 'admin');
scope.setUser({ id: '4711' });

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

## Contributors

Thanks to everyone who contributed to the Sentry Electron SDK!

<a href="https://github.com/getsentry/sentry-electron/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=getsentry/sentry-electron" />
</a>
