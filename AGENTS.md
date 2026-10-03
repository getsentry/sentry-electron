# Agent guidance for sentry-electron

## Running the e2e tests

The end-to-end tests in [`test/e2e`](./test/e2e) launch real Electron apps. A few things are required to run them
successfully, especially from an agent shell such as Claude Code:

- **`unset ELECTRON_RUN_AS_NODE` first.** Some agent shells, such as Claude Code, export `ELECTRON_RUN_AS_NODE=1`,
  which makes every Electron binary run as plain Node. When that happens `require('electron').app` is `undefined` and
  every test crashes at SDK load (`normalize.js` calling `app.getAppPath()`) or times out. This is not a broken
  harness — it only affects shells where that variable is set.
- **Set `ELECTRON_VERSION`.** The runner throws `ELECTRON_VERSION is not set` otherwise. The SDK needs Electron 35 or
  higher, so use a version in that range whose binary is already cached (e.g. `39.8.10`).
- **Build and pack the SDK first.** The test apps install `sentry-electron-v<version>.tgz` from the repo root, and
  `yarn e2e` does not create it. Run `yarn build && yarn pack` after each change to `src`.
- **Use `yarn e2e`, not a bare `vitest` invocation.** `yarn e2e` runs the `pree2e` step (`set-version`, cache cleanup)
  that the tests depend on.
- **`-t` is a regex**, so escape parentheses in test names, e.g. `-t 'Browser Tracing \(Span streaming\)'`.
- **`DEBUG=true`** prints every received envelope as `[Test Runner] Received event ...`, which is the easiest way to
  build/verify assertions.

Example — run all span-streaming tests against Electron 39.8.10:

```shell
unset ELECTRON_RUN_AS_NODE
yarn build && yarn pack
DEBUG=true ELECTRON_VERSION=39.8.10 yarn e2e -t 'Span streaming'
```
