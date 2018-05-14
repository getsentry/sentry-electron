const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  devtool: 'source-map',
  entry: ['./app/index.js'],
  externals: ['electron'],
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
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
};
