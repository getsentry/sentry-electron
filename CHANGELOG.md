# Changelog

## Unreleased

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
    onFatalError: error => {
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
