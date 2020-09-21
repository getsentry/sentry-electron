// eslint-disable-next-line no-unused-vars
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  {
    mode: 'development',
    devtool: 'source-map',
    entry: './main.js',
    target: 'electron-main',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'main.js',
    },
    externals: ['electron'],
  },
  {
    mode: 'development',
    devtool: 'source-map',
    entry: './renderer.js',
    target: 'electron-renderer',
    output: {
      filename: 'renderer.js',
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './app/index.html' }),
      new CopyWebpackPlugin([
        {
          from: 'app/*',
          ignore: ['*.js'],
          flatten: true,
        },
      ]),
    ],
  },
];
