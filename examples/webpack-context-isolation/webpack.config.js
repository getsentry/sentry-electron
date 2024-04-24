const HtmlWebpackPlugin = require('html-webpack-plugin');
const CspHtmlWebpackPlugin = require('csp-html-webpack-plugin');
// const WarningsToErrorsPlugin = require('warnings-to-errors-webpack-plugin');
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

const sentryWebpackPluginOptions = {
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
};

module.exports = [
  {
    mode: 'production',
    entry: './src/main.js',
    target: 'electron-main',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'main.js',
    },
    plugins: [/* new WarningsToErrorsPlugin() */ sentryWebpackPlugin(sentryWebpackPluginOptions)],
  },
  {
    mode: 'production',
    entry: './src/renderer.js',
    target: 'web',
    output: {
      filename: 'renderer.js',
    },
    plugins: [
      new HtmlWebpackPlugin(),
      // new WarningsToErrorsPlugin(),
      new CspHtmlWebpackPlugin({
        'default-src': "'self'",
        'script-src': "'self'",
      }),
      sentryWebpackPlugin(sentryWebpackPluginOptions),
    ],
  },
];
