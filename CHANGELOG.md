# Changelog

## v0.5.0

**Breaking Changes**:

* All functions like `captureException` are now direct named exports
* Most functions are now sync, and the async ones take a callback parameter
* The SDK is now initialized via `init()` (was `create` before)

See the readme for full usage instructions, as well as the
[@sentry/next tracking issue](https://github.com/getsentry/raven-js/issues/1281)
for details on this change.

**Other Changes**:

* Set the default number of breadcrumbs to `30`
* Fix an issue with paths containing spaces

## v0.4.2

* Fix adding breadcrumbs in the renderer process
* Fix setting context in the renderer process
* Fix a crash during startup when trying to load breadcrumbs
* Handle `onFatalError` correctly

## v0.4.1

* Support for JavaScript errors and native crashes (Electron `CrashReporter`)
* Record breadcrumbs and context information across renderers and the main
  process
* Device and event information is included in every event
* Buffer crash reports and events as long as the device is offline
