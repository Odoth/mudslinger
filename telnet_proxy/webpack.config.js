const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './dist/telnet_proxy/src/app.js',
  target: 'node',
  output: {
    filename: 'telnet_proxy.js',
    path: path.resolve(__dirname, 'dist/telnet_proxy/bundle'),
  },
  node: {
    __dirname: false
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'socket.io-client/package': path.join( path.resolve(__dirname), 'node_modules/socket.io-client', 'package.json' ),
      'socket.io-client/dist/socket.io.min.js': path.join( path.resolve(__dirname), 'node_modules/socket.io-client/dist', 'socket.io.min.js' ),
    }
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        cache: true,
        parallel: true,
        sourceMap: false, // Must be set to true if using source-maps in production
        terserOptions: {
          // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
          ecma: undefined,
          parse: {},
          compress: true,
          mangle: true, // Note `mangle.properties` is `false` by default.
          module: false,
          output: null,
          toplevel: false,
          nameCache: null,
          ie8: false,
          keep_classnames: undefined,
          keep_fnames: false,
          safari10: false,
        }
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        enforce: 'pre', 
      },
    ],
  },
};