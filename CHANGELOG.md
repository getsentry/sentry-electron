# Changelog

## v0.5.3

* Add breadcrumbs for renderer crashes (#71)

## v0.5.2

* Fix a startup error in Electron 1.7 and earlier (#66)
* Disable native crash handling in MAS builds (#67)

## v0.5.1

* Added default values for `release` and `environment`
* Added an `event_type` tag to distinguish native from javascript errors
* Send runtime information along with events: Electron, Chrome and Node versions
* Send app meta data, such as the application name and version

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
