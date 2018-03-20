# Changelog

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
