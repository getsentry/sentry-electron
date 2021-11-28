# Tests 🧪

## Unit Tests

Currently there are only unit tests [covering path normalization](./unit/normalize.test.ts).

Running the unit tests:

```shell
yarn test
```

## End-to-end Tests

There is an extensive matrix of end-to-end tests that run on CI and test:

- All supported versions of Electron (2.0+)
- All major platforms (Windows, macOS and Linux)
- All features and integrations
- Event and session submission to mock Sentry server
- Successful bundling and subsequent event submission

Running the end-to-end tests:

```shell
yarn e2e
```

If the `ELECTRON_VERSION` environment variable is set, only that version of Electron will be tested, otherwise all
versions will be tested.

### Test Recipes

Each individual e2e test consists of a test recipe which is a self contained application in its own right. There are
simple [functional test recipes](./e2e/test-apps/) and [example app recipes](../examples/).

Recipes are run sequentially and the events submitted to the mock server are compared to the expected events using
`chai-subset`.

Each recipe should contain:

- `recipe.yml` (details below)
- `package.json` with a unique `name`
- Events expected to be sent to the server (`event*.json`/`session*.json`)

#### `recipe.yml`

The `recipe.yml` contains a number of optional keys with only `description` required.

Run a single test by renaming to `recipe.only.yml`.

| Key             | Type      | Description                                     |
| --------------- | --------- | ----------------------------------------------- |
| `description`   | `string`  | Friendly name displayed in test output          |
| `category`      | `string`  | Used for grouping test output                   |
| `command`       | `string`  | Initialization/build command to run in app root |
| `condition`     | `string`  | Condition for running the test                  |
| `timeout`       | `number`  | Test timeout in seconds                         |
| `runTwice`      | `boolean` | If the application should be run twice          |
| `expectedError` | `string`  | Expected error string in log output             |

#### `condition`

A JavaScript expression evaluated to determine whether the test should be run for the current platform and version of
Electron. A number of variables are available to simplify usage:

```ts
namespace Global {
  const platform: 'win32' | 'darwin' | 'linux';
  const version: { major: number; minor: number; patch: number };
  const usesCrashpad: boolean;
  const supportsContextIsolation: boolean;
}
```

If a test should only run for Electron >= v5 where Crashpad is used, the `condition` would be:

```ts
version.major >= 5 && usesCrashpad;
```

#### `runTwice`

Some tests require that the application is run a second time so that crashes or sessions can be sent from the first run.

In the app, you can differentiate between the first and second run via the `APP_FIRST_RUN` environment variable. Recipe
apps are expected to close themselves after the first run.

#### `expectedError`

Some test are expected to throw errors or log output to the console. If `expectedError` is defined, the test will fail
if the string cannot be found in the application log output.

### Recipe Steps

- If `condition` is defined, it's evaluated and the recipe is skipped if it returns `false`
- All files apart from `recipe.yaml`/`event*.json`/`session*.json` are copied to a temporary directory
  - Occurrences of `__DSN__` found in any file are replaced with the the mock server localhost DSN
  - If `@sentry/electron` is found in the dependencies in `package.json`, the version is replaced with a path to the npm
    packed SDK in the project root `file:../../../sentry-electron-{version}.tgz`
- If `command` is defined, it's run in the root of the recipe and we ensure a zero exit code
- Application is started with a specific Electron version
- If `runTwice == true`, the app will be started again when it closes
- Wait for the expected number of events to be sent to the mock server
- Compare received events and ensure they match events found in `event*.json`/`session*.json` files
  - Server events are normalized by replacing timestamps, versions and IDs so they can be compared
  - `event*.json`/`session*.json` may contain a `condition` key so event matching can vary by platform or Electron
    version
- If `expectedError` is defined, ensure string is found in log output
