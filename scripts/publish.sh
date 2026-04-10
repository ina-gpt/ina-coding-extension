#!/bin/bash
set -euo pipefail

echo "=== INA Coding Extension — Publish Script ==="
echo ""

# Verify we're in the right directory
if [ ! -f "package.json" ]; then
  echo "ERROR: Run from extension root directory"
  exit 1
fi

# Read version
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Version: $VERSION"

# Check for uncommitted changes (if git repo)
if [ -d ".git" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "WARNING: Uncommitted changes detected. Commit before publishing."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  fi
fi

# Clean build
echo "Cleaning..."
rm -rf dist/ *.vsix

# Build webview
echo "Building webview UI..."
cd webview-ui
npm run build
cd ..

# Build extension
echo "Building extension..."
npm run compile

# Production build
echo "Packaging production build..."
npm run package

# Build VSIX
echo "Building VSIX package..."
npx vsce package --no-dependencies

VSIX_FILE=$(ls -t *.vsix | head -1)
echo ""
echo "=== VSIX Package Created ==="
echo "File: $VSIX_FILE"
echo "Size: $(du -sh "$VSIX_FILE" | cut -f1)"
echo ""

# Validate
echo "Validating..."
node -e "
const pkg = require('./package.json');
const checks = [];
if (!pkg.icon) checks.push('Missing: icon');
if (!pkg.publisher) checks.push('Missing: publisher');
if (!pkg.description) checks.push('Missing: description');
if (!pkg.categories?.length) checks.push('Missing: categories');
if (checks.length) {
  console.error('VALIDATION FAILED:');
  checks.forEach(c => console.error('  ✗', c));
  process.exit(1);
}
console.log('Validation passed ✓');
"

echo ""
echo "=== Ready to Publish ==="
echo ""
echo "Option 1 — CLI publish:"
echo "  vsce login inagpt"
echo "  vsce publish"
echo ""
echo "Option 2 — Manual upload:"
echo "  1. Go to https://marketplace.visualstudio.com/manage"
echo "  2. Upload $VSIX_FILE"
echo ""
echo "Option 3 — Install locally:"
echo "  code --install-extension $VSIX_FILE"
echo ""
