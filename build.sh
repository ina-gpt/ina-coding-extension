#!/bin/bash
set -e

echo "Building INA Coding Extension..."

echo "1/3 Building webview UI..."
cd webview-ui && npm run build && cd ..

echo "2/3 Compiling extension..."
npm run compile

echo "3/3 Packaging for production..."
npm run package

echo "Build complete!"
ls -lh dist/extension.js
ls -lh webview-ui/dist/assets/
