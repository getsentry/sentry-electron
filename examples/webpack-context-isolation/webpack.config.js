const HtmlWebpackPlugin = require('html-webpack-plugin');
const CspHtmlWebpackPlugin = require('csp-html-webpack-plugin');
const WarningsToErrorsPlugin = require('warnings-to-errors-webpack-plugin');

module.exports = [
  {
    mode: 'production',
    entry: './src/main.js',
    target: 'electron-main',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'main.js',
    },
    plugins: [new WarningsToErrorsPlugin()],
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
      new WarningsToErrorsPlugin(),
      new CspHtmlWebpackPlugin({
        'default-src': "'self'",
        'script-src': "'self'",
      }),
    ],
  },
];
