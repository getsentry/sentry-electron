const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  devtool: 'source-map',
  entry: ['./app/index.js'],
  externals: {
    electron: 'commonjs electron',
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: 'app/*',
        ignore: ['*.js'],
        flatten: true,
      },
    ]),
  ],
  node: {
    fs: 'empty',
    console: true,
    module: 'empty',
  },
};
