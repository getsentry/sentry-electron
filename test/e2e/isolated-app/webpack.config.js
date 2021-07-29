const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = [
  {
    mode: 'production',
    entry: './src/main.js',
    target: 'electron-main',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'main.js',
    },
  },
  {
    mode: 'production',
    entry: './src/renderer.js',
    target: 'web',
    output: {
      filename: 'renderer.js',
    },
    plugins: [new HtmlWebpackPlugin()],
  },
];
