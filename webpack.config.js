//@ts-check
'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },

  externals: {
    vscode: 'commonjs vscode'
  },

  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'es6'
              }
            }
          }
        ]
      }
    ]
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'media', to: 'media' },
        { from: 'webview-ui/dist', to: 'webview-ui', noErrorOnMissing: true }
      ]
    })
  ],

  devtool: 'nosources-source-map',

  infrastructureLogging: {
    level: 'log'
  },

  optimization: {
    minimize: true
  }
};

module.exports = [extensionConfig];
