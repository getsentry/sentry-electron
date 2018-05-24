<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry Crash Test

This is an example Electron app that sends reports to Sentry for JavaScript and
native crashes. It uses `webpack` to build the renderer JavaScript.

![Screenshot](https://user-images.githubusercontent.com/1433023/39999656-f07bd98a-5789-11e8-9bc7-d68c1e03d897.png)

## Usage

To run the example application, install its dependencies, build renderer assets
and start the app:

```sh
yarn         # Install dependencies
yarn build   # Build renderer assets
yarn start   # Run the application
```

## Development

For local development, use `yarn link` to use your local checkout of the SDK
over the version downloaded from npm:

```sh
# cd /path/to/sentry-electron
yarn build
yarn link

# cd /path/to/example
yarn link @sentry/electron
yarn build
yarn start
```

When making changes to the SDK, always remember to execute `yarn build` in the
SDK folder before rebuilding the example app. Otherwise, changes will not
reflect in the bundle.
