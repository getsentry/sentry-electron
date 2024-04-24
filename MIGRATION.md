# Upgrading from 4.x to 5.x

Many breaking changes in v5 are due to changes in the underlying Sentry JavaScript SDKs so be sure to check the
[JavaScript v8 migration
docs](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#upgrading-from-7x-to-8x).

## Supported Electron Versions

The Sentry Node SDK now requires Node >= 14.18.0 which means the Sentry Electron SDK now supports Electron >= 15.0.0.

## Initializing the SDK in v5

From v5, the root export (`@sentry/electron`) is no longer used and will throw and error if it's imported.

In previous versions of the SDK, this export would attempt to detect the Electron process type and import the correct
entry point. This was problematic for many bundlers, caused issues with tree shaking and obfuscated the fact that the
there are distinct SDKs for each Electron process.

In the Electron main process you should import from `@sentry/electron/main`:
```javascript
import * as Sentry from '@sentry/electron/main';

Sentry.init({
  dsn: '__DSN__',
  // ...more options
});
```

In all Electron renderer processes you should import from `@sentry/electron/renderer`:
```javascript
// In the Electron renderer processes
import * as Sentry from '@sentry/electron/renderer';

// It's not a requirement to pass any options in the renderer processes because
// much of the functionality is configured from the main process
Sentry.init();
```

## Deprecated Class Based Integrations

In v5, integrations are no longer classes and instead the are functions. Both the use as a class, as well as accessing
integrations from the Integrations.XXX hash, is deprecated in favor of using the new functional integrations.


| Old | New |
| --- | --- |
| `new Integrations.SentryMinidump()` | `sentryMinidumpIntegration()` |
| `new Integrations.AdditionalContext()` | `additionalContextIntegration()` |
| `new Integrations.Anr()` | `anrIntegration()` |
| `new Integrations.BrowserWindowSession()` | `browserWindowSessionIntegration()` |
| `new Integrations.ChildProcess()` | `childProcessIntegration()` |
| `new Integrations.ElectronBreadcrumbs()` | `electronBreadcrumbsIntegration()` |
| `new Integrations.ElectronMinidump()` | `electronMinidumpIntegration()` |
| `new Integrations.MainProcessSession()` | `mainProcessSessionIntegration()` |
| `new Integrations.Net()` | `electronNetIntegration()` |
| `new Integrations.OnUncaughtException()` | `onUncaughtExceptionIntegration()` |
| `new Integrations.PreloadInjection()` | `preloadInjectionIntegration()` |
| `new Integrations.RendererProfiling()` | `rendererProfilingIntegration()` |
| `new Integrations.Screenshots()` | `screenshotsIntegration()` |

### `additionalContextIntegration()` Changes

The `additionalContextIntegration()` no longer includes the `cpu`, `memory` and `language` options. These are configured
via the `nodeContextIntegration()` options.

## New Default Integrations

### `electronContextIntegration()`

Adds Electron specific context information to events on top of that already supplied by the Node SDK.

### `normalizePathsIntegration()`

Normalizes paths in stack traces and URLs to be relative to the app root.

## `event_type` tag removed

The `event_type` tag was deprecated in favor of the `event.environment` tag in v4 and has been removed entirely in v5.

## Offline Transport Options

The offline transport now uses the logic from `@sentry/core` which more closely follows the transport specification.
This means the `beforeSend` callback has been replaced by the `shouldSend` and `shouldStore` callbacks.

Previously the `beforeSend` callback signature was:
```typescript
type BeforeSendResponse = 'send' | 'queue' | 'drop';

/**
 * Called before attempting to send an event to Sentry.
 *
 * Return 'send' to attempt to send the event.
 * Return 'queue' to queue and persist the event for sending later.
 * Return 'drop' to drop the event.
 */
beforeSend?: (request: TransportRequest) => BeforeSendResponse | Promise<BeforeSendResponse>;
```

The new `shouldSend` and `shouldStore` callbacks have the following signatures:
```typescript
/**
 * Called before we attempt to send an envelope to Sentry.
 *
 * If this function returns false, `shouldStore` will be called to determine if the envelope should be stored.
 *
 * Default: () => true
 *
 * @param envelope The envelope that will be sent.
 * @returns Whether we should attempt to send the envelope
 */
shouldSend?: (envelope: Envelope) => boolean | Promise<boolean>;

/**
 * Called before an event is stored.
 *
 * Return false to drop the envelope rather than store it.
 *
 * Default: () => true
 *
 * @param envelope The envelope that failed to send.
 * @param error The error that occurred.
 * @param retryDelay The current retry delay in milliseconds.
 * @returns Whether we should store the envelope in the queue
 */
shouldStore?: (envelope: Envelope, error: Error, retryDelay: number) => boolean | Promise<boolean>;
```


# Upgrading from 3.x to 4.x

All the breaking changes in v4 are due to changes in the underlying Sentry JavaScript SDKs so be sure to check the
[JavaScript v7 migration docs](https://github.com/getsentry/sentry-javascript/blob/master/MIGRATION.md#upgrading-from-6x-to-7x).

# Upgrading from 2.x to 3.x

v3 of the Electron SDK includes significant changes to simplify usage, improve maintainability and bundler support.

For some advanced technical detail, you may want to check out the relevant
[Proposal](https://github.com/getsentry/sentry-electron/issues/360) and initial
[Pull Request](https://github.com/getsentry/sentry-electron/pull/361).

New Features:

- Session tracking data sent by default. See our
  [release health docs for more details](https://docs.sentry.io/product/releases/health/). You can opt out of this
  behaviour by setting `autoSessionTracking: false` during SDK initialization.
- Performance monitoring of renderer instances using the `BrowserTracing` integration from `@sentry/tracing`
- Preload script no longer required [for most scenarios](https://github.com/getsentry/sentry-electron/issues/376)
- Optional relative imports for main/renderer/preload entry points to help with bundlers
- Offline support for the default transport
- Additional device context (cpu, screen, memory, language details)
- Minidumps for GPU crashes

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
