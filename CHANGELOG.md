# Changelog

## Unreleased

## 4.9.0

- fix: Ensure context from previous run is used for native main crashes (#683)
- feat: Tracing without performance (#710)
- feat: Deprecate `tracingOrigins` for `tracePropagationTargets` (#703)
- feat: Use `protocol.handle` on Electron >= v25 (#704)
- test: Update from [v7.58.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.58.0) to [v7.61.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.61.0) of JavaScript SDKs (#709)

## 4.8.0

- feat: Update to [v7.58.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.58.0) of JavaScript SDKs
  (#699)
- fix: Normalize filename before parsing into module name (#699)

## 4.7.0

- feat: Update to [v7.57.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.57.0) of JavaScript SDKs
  (#690)

## 4.6.0

- feat: Update to [v7.50.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.50.0) of JavaScript SDKs
  (#671)
- fix: Fix debug ID matching by normalizing `debug_meta` paths (#676)

## 4.5.0

- feat: Update to [v7.48.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.48.0) of JavaScript SDKs
  (#662)
- fix: IPC protocol should be registered as secure (#664)

## 4.4.0

- feat: Update to [v7.46.0](https://github.com/getsentry/sentry-javascript/releases/tag/7.46.0) of JavaScript SDKs
  (#657)

## 4.3.0

- fix: Add 2 second timeout to session flushing (#644)
- feat: Update dependencies (#640)
- feat: Update Sentry SDKs to 7.37.1 (#636)
- fix: Replay should be re-exported (#633)

## 4.2.0

- feat: Update JavaScript SDKs to 7.30.0 and add support for Replay in renderers (#618)
- feat: Use a transport to send events to main process rather than via integration (#610)
- test: Add test to ensure window titles don't end up in breadcrumbs when disabled (#594)
- fix: Use POST for main process ping so it does not result in fetch breadcrumb (#612)
- CI: Use volta-cli/action to use the correct node version (#609)
- CI: Auto-generate PRs for JavaScript SDK updates (#608)

## 4.1.2

- fix: Ensure the scope writes do not beat the initial async scope read (#593)
- fix: Also check crashpad pending directory on macOS when renderer process exits (#592)

## 4.1.1

- feat: Add additional options and queue status callback to offline transport (#580)
- fix: Change parameter name to give more useful TypeScript error on SDK version mismatch (#584)
- fix: Attempt to send minidumps for all process gone reasons (#586)

## 4.1.0

- feat: Support passing JavaScript framework specific SDK init as second init parameter (#575)
- feat: Update JavaScript SDKs to 7.15.0 (#572)
- fix: Include `sentry_key` in IPC Ping URL so it does not create breadcrumbs (#576)

## 4.0.3

- fix: `ElectronMainOptions` type should be a union with `NodeOptions`

## 4.0.2

This patch contains no changes. It has been made to make sure the `4.x` set of versions have the `latest` tag on npm.

## 4.0.1

- fix: Page titles in breadcrumbs should not change (#551)
- feat: Update to v7.12.1 of JavaScript SDKs (#548)
- fix: Pass attachments from renderer to main (#536)

## 4.0.0

Updating the underlying Sentry JavaScript SDK's to v7 forces a major version bump due to minor breaking changes in user
facing APIs. Be sure to check out the [migration doc](./MIGRATION.md).

Upgrading to v7.8.1 of the Sentry JavaScript SDKs (#471 and #527):

- Minor internal changes due to API changes and deprecations
- Rewrite transports to use new functional API
- Simplify minidump submission since the underlying SDK now supports attachments

Other additions and fixes:

- feat: Add ability to explicitly control offline mode (#489)
- feat: Allow closing of SDK (#467)
- feat: Optionally attach screenshots (#510)
  - **Disabled by default - Screenshots may contain PII**
- fix: Ensure environment is overridden for minidumps (#497)
- fix: Pass correct event to beforeSend (#481)
- fix: Correctly parse mixed Chrome/node stack traces in the renderer (#509)
- fix: Check for absolute paths for preload scripts (#516)
- fix: Allow async `beforeSend` in offline transport (#514)

## 4.0.0-beta.1

Upgrading to v7 of the Sentry JavaScript SDKs (#471):

- Minor internal changes due to API changes and deprecations
- Rewrite transports to use new functional API
- Simplify minidump submission since the underlying SDK now supports attachments

Other additions and fixes:

- feat: Add ability to explicitly control offline mode (#489)
- feat: Allow closing of SDK (#467)
- feat: Optionally attach screenshots (#510)
  - **Disabled by default - Screenshots may contain PII**
- fix: Ensure environment is overridden for minidumps (#497)
- fix: Pass correct event to beforeSend (#481)
- fix: Correctly parse mixed Chrome/node stack traces in the renderer (#509)

## 3.0.7

- fix: export map and sideEffects (#464)
- fix: Don't capture window titles by default (#463)
- fix: Don't throw on HTTP errors (#458)
- fix: Throw error if main process code is loaded in renderer (#457)
- fix: Don't exit if preventDefault used in will-quit event (#451)

## 3.0.6

- fix: Update Sentry SDKs to `6.19.2`
- fix: Make `getSessions` and `ipcMode` on `ElectronMainOptions` optional (#448)
- fix: Webpack issue with `electron-react-boilerplate` (#446)

## 3.0.5

- fix: Limit retryDelay to avoid integer overflows in setTimeout (#441)

## 3.0.5

- fix: Issue where transport errors can prevent app exit

## 3.0.4

- fix: Use esModuleInterop for deepmerge (#432)
- fix: Lazily initialise IPC in renderer (#428)

## 3.0.3

- fix: Don't add empty breadcrumbs (#425)
- fix: Delete sdk metadata from event before sending (#424)
- fix: Improve error messages for incorrectly bundled code (#423)

## 3.0.2

- fix: Fix broken serialization of node transaction spans (#419)

## 3.0.1

- fix: Fixes a potential issue on macOS where the window URL is not accessible after crash (#417)

## 3.0.0

A large refactor and simplification of the SDK moving most of the functionality into integrations used with
`@sentry/browser` and `@sentry/node`.

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

- See [`MIGRATION.md`](./MIGRATION.md)

## 3.0.0-beta.4

- feat: Adds `ElectronOfflineNetTransport` and makes it the default transport
- feat: Adds `AdditionalContext` integration that includes additional device and enables it by default (#390)
- feat: Renames `ElectronEvents ` to `ElectronBreadcrumbs` and allows more complex configuration
- fix: Fixes bundling of preload code (#396)
- feat: Adds breadcrumbs and tracing for the Electron `net` module (#395)
- feat: Breadcrumbs and events for child processes (#398)
- feat: Capture minidumps for GPU crashes with `SentryMinidump` integration (#398)

## 3.0.0-beta.3

- fix: Enable CORS for custom protocol

## 3.0.0-beta.2

- fix: Correctly handle previously crashed/abnormal sessions (#379)
- feat: Remove the need for preload script in most cases by falling back to custom protocol (#377)
- fix: Fix issues with incorrect environment (#378)
- test: Refactor tests and examples into self contained apps (#373)
- fix: Fixed a number of issues with incorrect context (#373)

## 3.0.0-beta.1

Check out [the migration guide](https://github.com/getsentry/sentry-electron/issues/370).

New Features:

- Session tracking enabled by default
- Improved bundler support
- Browser Tracing compatible

Breaking changes:

- Preload script now required
- Native crashes now consider `sampleRate` and `beforeSend`
- Configuration through integrations rather than options

## 2.5.4

- fix: Improve compatibility with bundlers

## 2.5.3

- fix: Possible race condition with `initialScope` over IPC

## 2.5.2

- fix: Add `release` and `environment` to electron uploader `initialScope`

## 2.5.1

- feat: Context and breadcrumbs sent via Crashpad for native crashes in main process when `useCrashpadMinidumpUploader`
  enabled
- fix: Handle net response error event

## 2.5.0

- feat: Update to latest Sentry SDKs (6.7.1) (#332 + #342)
- fix: IPC breadcrumb serialization issue (#330)
- fix: Improve error text when `init` has not been called in the main process (#222)
- fix: Ensure `maxBreadcrumbs` is passed to `addBreadcrumb` to ensure number of breadcrumbs is limited
- fix: Stop capturing `app.remote-` events to breadcrumbs because they are too verbose
- fix: Delete Crashpad metadata file to fix errors (#341)
- feat: Add `initialScope` to `globalExtra` (#340)
- fix: Correctly handle Breakpad multipart dmp format (#343)

## 2.4.1

- fix: Missing scope updates from isolated renderer (#322)
- fix: Limit IPC serialization depth to 50 (#263)
- fix: Check for require with typeof (#319)

## 2.4.0

- feat: Add support for Electron 12

## 2.3.0

- feat: Support for `contextIsolation` (#280)

## 2.2.0

- feat: Do not start crash reporter in renderer (#290)

## 2.1.0

- feat: Compress minidump uploads (#286)

## 2.0.4

- fix: Remember stored scope & bump dependencies (#274)

## 2.0.3

- ref: Don't call `beforeSend` for internal minidump (#273)

## 2.0.2

- fix: Add guard for phantom event (#271)

## 2.0.1

- fix: The default version is now correctly sent with an `@` seperator e.g: `name@version` (#260)
- fix: Set `compress: true` for crash reporter (#260)

## 2.0.0

**Breaking Change**: This version uses the [envelope endpoint](https://develop.sentry.dev/sdk/envelopes/). If you are
using an on-premise installation it requires Sentry version `>= v20.6.0` to work. If you are using
[sentry.io](https://sentry.io) nothing will change and no action is needed.

- ref: Decrease bundle size by removing dependencies (#252)
- ref: Use envelope endpoint (#252)
- feat: Export NetTransport (#252)
- feat: Export `flush` & `close` (#252)
- feat: Bump `@sentry/*` `~5.21.1`
- feat: Bump `typescript` `3.9.7`

## v1.5.2

- fix: Cirular refs (#253)

## v1.5.1

- fix: Rate limit status check (#251)

## v1.5.0

- fix: Add `tslib` dependency
- feat: Bump `@sentry/*` `~5.19.1`
- feat: Provide `esm` build for better treeshakeability

## v1.4.0

- feat: Add rate limiting to net transport (#245)
- fix: Expose `browser` & `module` field in `package.json` for bundlers (#241)
- feat: Bump `@sentry/*` `~5.19.1`
- fix: Don't persist scope data across starts (#242)
- feat: New options `useCrashpadMinidumpUploader` and `useSentryMinidumpUploader` (#244)

## v1.4.0-beta.0

- fix: Expose `browser` & `module` field in `package.json` for bundlers (#241)

## v1.3.2

- fix: Create error object in case we cant detect it (#240)

## v1.3.1

- fix: Add test for electron.net module (#235)
- fix: getCrashesDirectory is documented as API now (#234)
- fix: check if contents is destroyed before hooking for breadcrumbs (#230)
- perf: dont double serialize IPC messages (#232)

## v1.3.0

- feat: Bump `@sentry/*` `~5.13.2`

## v1.2.1

- Add Support for Electron 8

## v1.2.0

- meta: Update dependencies
- fix: Fixed location for win-ca write path
- feat: Allow usage without remote module
- ref: Use electron-fetch again
- fix: Add try/catch for decode

## v1.1.0

- meta: Update dependencies
- feat: Support electron 7

## v1.1.0-beta.0

- meta: Update dependencies
- fix: Use crashpad logic for Electron >= v6 on Windows
- fix: Use node-fetch rather than electron-fetch
- feat: Use win-ca to load Windows root CA's to give same behaviour as electron-fetch
- meta: Use Sentry logger to trace some caught exceptions

## v1.0.0

A lot of internal changes making use of the latest `5.x` relesase of the Browser/Node SDK.

**Breaking**: We persist scope data to disk in case of a native crash. Since the internal scope data changed, existing
scope data is not compatible with the new format. When upgrading to `1.x.x`, existing scope data will be wiped on disk.
This only affects your app if the update occurs immediately after a crash, in which case this single event will not have
scope data attached.

- Feat: Bump `@sentry/*` `~5.7.1`

## v0.17.4

- meta: Empty release for latest npm tag

## v0.17.3

- Fix: Remove `webpack:/` part of base path in normalize

## v0.17.2

- Fix: Add `device.family` and `browser.name` context
- Fix: `undefined` event_id #171

## v0.17.1

- Fix electron-fetch dependency/ fixing windows crash reports #165

## v0.17.0

- Add new option to define the renderer name: `getRendererName?(contents: Electron.WebContents): string | undefined;`
- Fixed a bug where native crashes wouldn't be sent.
- Trim all whitespaces from release.

## v0.16.0

- Bump deps to use `@sentry/*` `4.6.2 || ~4.6.4`
- Escape base path (#153)
- Only show dialog if there are no uncaughtException handlers (#147)

## v0.15.0

- Bump deps to use `@sentry/*` `~4.5.0`
- Remove dynamic app name loading from package.json for release name. Release now only is the version number of the app.

## v0.14.0

- Bump deps to use `@sentry/*` `~4.3.4`
- Fixed #139

## v0.13.0

- Bump deps to use `@sentry/*` `~4.2.3`
- Fixed #131
- Fixed #132

## v0.12.1

- Bump deps to use `@sentry/utils` `~4.1.1`
- Bump deps to use `@sentry/types` `~4.1.0`

## v0.12.0

- Bump deps to use `@sentry/*` `~4.1.1`
- Move `normalizeEvent` to `prepareEvent`
- Fix `unresponsive` electron event

## v0.11.0

- Expose `showReportDialog`

**Breaking Changes**:

- Removed `getCurrentFrontend()` function, you can achieve the same with `getCurrentHub().getClient()`

## v0.10.1

- Fix exports, `withScope` is now available

## v0.10.0

- Updated deps to use `@sentry/*` `^4.0.0`

## v0.9.0

- Updated deps to use `@sentry/*` `4.0.0-rc.1`
- Fixed #109
- Fixes #106
- Fixes #94
- `captureMessage` now accepts `level` as a second parameter.

## v0.8.1

- Updated deps to use `@sentry/*` `4.0.0-beta.12`

## v0.8.0

- Updated deps to use `@sentry/*` `4.0.0-beta.11`
- Send new SDK identifier `sentry.javascript.electron`
- Expose `getIntegrations()` to retrieve all Integrations

## v0.7.0

**Breaking Changes**:

- We no longer exit your app by default. Before `0.7.0` we would call `process.exit(1)` after we caught and uncaught
  error. As of version `0.7.0` we no longer change electrons default behavior which is showing a dialog with the error
  and keep the app alive. If you want to exit the app or do something else if a global uncaught error happens you have
  to set the `onFatalError` option in init like (we will send the error to Sentry before this is called):

  ```javascript
  init({
    dsn: 'DSN',
    onFatalError: (error) => {
      // I really want to crash
      process.exit(1);
    },
  });
  ```

## v0.6.0

**Breaking Changes**:

- We removed `set___Context` functions, now you can configure the context with:

```
Sentry.configureScope(scope => {
  scope.setExtra('battery', 0.7);
  scope.setTag('user_mode', 'admin');
  scope.setUser({ id: '4711' });
  // scope.clear();
});
```

## v0.5.5

- Add official support for sandbox mode (#84)
- Fix Webpack use and add instructions to documentation (#84)
- Fix detection of Linux distributions (#80)

## v0.5.4

- Support Windows proxy configuration (#76)
- Invoke `shouldSend`, `beforeSend` and `afterSend` for native crashes (#78)
- Improve the SDK structure and reduce load times in renderers (#78)

## v0.5.3

- Add breadcrumbs for renderer crashes (#71)

## v0.5.2

- Fix a startup error in Electron 1.7 and earlier (#66)
- Disable native crash handling in MAS builds (#67)

## v0.5.1

- Added default values for `release` and `environment`
- Added an `event_type` tag to distinguish native from javascript errors
- Send runtime information along with events: Electron, Chrome and Node versions
- Send app meta data, such as the application name and version

## v0.5.0

**Breaking Changes**:

- All functions like `captureException` are now direct named exports
- Most functions are now sync, and the async ones take a callback parameter
- The SDK is now initialized via `init()` (was `create` before)

See the readme for full usage instructions, as well as the
[@sentry/next tracking issue](https://github.com/getsentry/raven-js/issues/1281) for details on this change.

**Other Changes**:

- Set the default number of breadcrumbs to `30`
- Fix an issue with paths containing spaces

## v0.4.2

- Fix adding breadcrumbs in the renderer process
- Fix setting context in the renderer process
- Fix a crash during startup when trying to load breadcrumbs
- Handle `onFatalError` correctly

## v0.4.1

- Support for JavaScript errors and native crashes (Electron `CrashReporter`)
- Record breadcrumbs and context information across renderers and the main process
- Device and event information is included in every event
- Buffer crash reports and events as long as the device is offline
