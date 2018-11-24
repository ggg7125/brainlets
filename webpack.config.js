const path = require('path');

module.exports = {
  module: {
    // configuration regarding modules
    rules: [
      // rules for modules (configure loaders, parser options, etc.)
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader', //to transpile es6 code to es5 so we can use import/export etc
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ],
  },
}