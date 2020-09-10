var path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/ts/client',
  output: {
    path: path.resolve(__dirname, "static/public"),
    filename: 'mudslinger-[hash].js',
    // Bundle absolute resource paths in the source-map,
    // so VSCode can match the source file.
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
  },
  plugins: [new HtmlWebpackPlugin({
      template: "./src/html/template.html",
      filename: path.resolve(__dirname, "static/public", "index.html")
  })],
  mode: 'development',
  // Pick any source-map that does not require eval.
  // `cheap-source-map` gives the best speed/quality for development.
  devtool: 'eval-source-map',
  resolve: {
    modules: ['node_modules'],
    extensions: ['.ts','.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader'
      }
    ]
  },
  devServer: {
    contentBase: path.resolve(__dirname, "static/public/"),
    inline: true,
    writeToDisk: true,
    host: 'localhost',
    port: 8080,
  },
};