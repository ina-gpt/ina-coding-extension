#!/bin/bash
set -euo pipefail

echo "=== INA Coding — Open VSX Publish Script ==="
echo ""

cd "$(dirname "$0")/.."

# Check ovsx is installed
if ! command -v ovsx &> /dev/null; then
  echo "Installing ovsx CLI..."
  npm install -g ovsx
fi

# Check for access token
if [ -z "${OVSX_PAT:-}" ]; then
  echo "ERROR: OVSX_PAT environment variable not set."
  echo ""
  echo "To get a token:"
  echo "1. Go to https://open-vsx.org"
  echo "2. Sign in with GitHub"
  echo "3. Go to Settings > Access Tokens"
  echo "4. Create a new token"
  echo "5. Export: export OVSX_PAT=your_token_here"
  echo ""
  echo "Or publish manually:"
  echo "  ovsx publish *.vsix -p YOUR_TOKEN"
  exit 1
fi

# Find or build VSIX
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
if [ -z "$VSIX_FILE" ]; then
  echo "No VSIX found — building..."
  ./scripts/publish.sh
  VSIX_FILE=$(ls -t *.vsix | head -1)
fi

echo "Publishing: $VSIX_FILE"
echo "Size: $(du -sh "$VSIX_FILE" | cut -f1)"
echo ""

# Verify package
echo "Verifying package..."
node -e "
const pkg = require('./package.json');
console.log('Name:', pkg.name);
console.log('Version:', pkg.version);
console.log('Publisher:', pkg.publisher);
console.log('Display Name:', pkg.displayName);
"
echo ""

# Pre-publish check
echo "Checking namespace..."
ovsx get inagpt.ina-coding 2>/dev/null && {
  echo "Extension already exists — this will update it"
} || {
  echo "First-time publish — namespace will be created"
}
echo ""

# Publish
echo "Publishing to Open VSX..."
ovsx publish "$VSIX_FILE" -p "$OVSX_PAT"

echo ""
echo "=== Published Successfully ==="
echo ""
echo "View at: https://open-vsx.org/extension/inagpt/ina-coding"
echo ""
echo "Install:"
echo "  VS Codium: codium --install-extension inagpt.ina-coding"
echo "  CLI: ovsx get inagpt.ina-coding"
