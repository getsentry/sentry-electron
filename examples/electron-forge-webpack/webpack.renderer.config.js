const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

module.exports = {
  // Put your normal webpack config below here
  plugins: [
    sentryWebpackPlugin({
      authToken: 'some invalid auth token',
      org: 'some invalid org',
      project: 'some invalid project',
      telemetry: false,
      sourcemaps: {
        assets: [], // no assets to upload - we just care about injecting debug IDs
      },
      release: {
        inject: false,
      },
      errorHandler() {
        // do nothing on errors :)
        // They will happen because of the invalid auth token
      },
    }),
  ],
};
