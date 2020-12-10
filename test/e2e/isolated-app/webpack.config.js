const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = [
  {
    mode: 'production',
    devtool: 'source-map',
    entry: './src/main.js',
    target: 'electron-main',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'main.js',
    },
    node: false,
    externals: ['electron'],
  },
  {
    mode: 'production',
    devtool: 'source-map',
    entry: './src/sentry.js',
    target: 'electron-renderer',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'preload.js',
    },
    node: false,
    externals: ['electron'],
  },
  {
    mode: 'production',
    devtool: 'source-map',
    entry: './src/renderer.js',
    target: 'web',
    output: {
      filename: 'renderer.js',
    },
    plugins: [new HtmlWebpackPlugin()],
    externals: ['electron'],
  },
];
