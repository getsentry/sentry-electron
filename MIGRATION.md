# Upgrading from 2.x to 3.x

v3 of the Electron SDK includes significant changes to simplify usage, improve maintainability and bundler support.

For some advanced technical detail, you may want to check out the relevant
[Proposal](https://github.com/getsentry/sentry-electron/issues/360) and initial
[Pull Request](https://github.com/getsentry/sentry-electron/pull/361).

New Features:

- Session tracking enabled by default
- Preload script no longer required [for most scenarios](https://github.com/getsentry/sentry-electron/issues/376)
- Optional relative imports for main/renderer/preload entry points
- Offline transport support
- Additional device context
- Minidumps for GPU crashes
- Browser Tracing compatible

Major breaking changes:

- Native crashes now consider `sampleRate` and `beforeSend`
- Configuration is now through integrations rather than options

## Session Tracking

Session tracking is now enabled by default so you will see
[Release Health](https://docs.sentry.io/product/releases/health/) data. Session tracking is via the `MainProcessSession`
integration which as the name suggests, tracks sessions as per the main process lifetime.

```ts
Sentry.init({
  dsn: '__DSN__',
  release: '__RELEASE__',
});
```

If you don't want to track sessions, this can be disabled by setting `autoSessionTracking` to `false`.

```ts
Sentry.init({
  dsn: '__DSN__',
  autoSessionTracking: false,
});
```

If you have a use case where sessions should be tracked in a different way, please open an issue!

## Relative Imports

The SDK uses
[multiple `package.json` fields](https://github.com/timfish/sentry-electron/blob/5bba1e9221e86f9d43f616f8db8112a23f22aea5/package.json#L5-L25)
to ensure that bundlers automatically pickup the the correct entry point for each Electron process when using the root
import (`const Sentry = require('@sentry/electron')` or `import * as Sentry from '@sentry/electron'`). This allows you
to have a `sentry.js` with your Sentry configuration imported into every process.

However, not all bundlers are created equal and you may want to add specific integrations to only one of the Electron
processes.

To support more complex configurations, you can now skip this automatic bundler target detection and import the process
specific code directly:

### Main Process

```ts
const Sentry = require('@sentry/electron/main');
// or
import * as Sentry from '@sentry/electron/main';
```

### Renderer Process

```ts
const Sentry = require('@sentry/electron/renderer');
// or
import * as Sentry from '@sentry/electron/renderer';
```

### Preload Code

```ts
require('@sentry/electron/preload');
// or
import '@sentry/electron/preload';
```

## Offline Support

The `ElectronOfflineNetTransport` is now the default transport. It wraps `ElectronNetTransport` and saves payloads to
disk if they cannot be sent.

## Additional device context

The default enabled `AdditionalContext` integration includes additional device context like screen resolution and memory
usage.

## Browser Tracing

The significant refactor now allows the use of Sentry browser tracing in the renderer process:

`main.js`

```ts
import * as Sentry from '@sentry/electron/main';

Sentry.init({
  dsn: '__DSN__',
});
```

`renderer.js`

```ts
import * as Sentry from '@sentry/electron/renderer';
import { Integrations } from '@sentry/tracing';

Sentry.init({
  integrations: [new Integrations.BrowserTracing()],
  tracesSampleRate: 1.0,
});
```

## Preload Scripts

**As of 3.0.0-beta.2 a preload script is no longer required for Electron >= v5** If IPC cannot be setup automatically,
we fallback to a custom protocol.

## Native Crashes, `sampleRate` and `beforeSend`

Previously, the SDK did not consider `sampleRate` when sending native crash events and it was not possible to intercept
them via the `beforeSend` hook. Theses are now correctly handled.

## Integrations over Options

Previously, the Electron SDK had various configuration options. Most of this functionality has moved to integrations as
has he configuration.

With v3, the only Electron specific configuration options are in the main process and are detailed below:

```ts
export interface ElectronMainOptions extends NodeOptions {
  /**
   * Inter-process communication mode to receive event and scope from renderers
   *
   * IPCMode.Classic - Configures Electron IPC
   * IPCMode.Protocol - Configures a custom protocol
   * IPCMode.Both - Configures both IPC and custom protocol
   *
   * Defaults to IPCMode.Both for maximum compatibility
   */
  ipcMode: IPCMode;
  /**
   * A function that returns an array of Electron session objects
   *
   * These sessions are used to configure communication between the Electron
   * main and renderer processes.
   *
   * Defaults to () => [session.defaultSession]
   */
  getSessions: () => Session[];
  /**
   * Callback to allow custom naming of renderer processes.
   *
   * If the callback is not set, or it returns `undefined`, the default naming
   * scheme is used.
   */
  getRendererName?: (contents: WebContents) => string | undefined;
}
```

#### Native Crash Reporting

For native crash reporting, you have three options

1. `SentryMinidump` integration (default) Uploads minidump files via the Sentry Envelope endpoint with full breadcrumbs
   and context
2. `ElectronMinidump` integration Uploads minidumps via Crashpad/Breakpad built in uploader with partial context

```ts
import { init, Integrations } from '@sentry/electron';

init({
  dsn: '__DSN__',
  // Adding the ElectronMinidump integration like this
  // ensures that it is the first integrations to be initialized.
  integrations: (defaultIntegrations) => {
    return [new Integrations.ElectronMinidump(), ...defaultIntegrations];
  },
});
```

3.  No native crash reporting (remove the `SentryMinidump` integration)

```ts
import { init, Integrations } from '@sentry/electron';

init({
  dsn: '__DSN__',
  integrations: defaultIntegrations => {
    return ...defaultIntegrations.filter(i => i.name != Integrations.SentryMinidump.Id);
  }
});
```
