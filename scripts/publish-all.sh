#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "  INA Coding — Publish to ALL Registries  "
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Version: $VERSION"
echo ""

# --- STEP 1: Clean Build ---
echo "=== Step 1: Clean Build ==="
rm -rf dist/ *.vsix

echo "Building webview..."
cd webview-ui && npm run build && cd ..

echo "Building extension..."
npm run compile

echo "Production package..."
npm run package

echo "Building VSIX..."
npx vsce package --no-dependencies

VSIX_FILE=$(ls -t *.vsix | head -1)
echo "VSIX: $VSIX_FILE ($(du -sh "$VSIX_FILE" | cut -f1))"
echo ""

# --- STEP 2: Validation ---
echo "=== Step 2: Validation ==="
node -e "
const pkg = require('./package.json');
const checks = [
  ['name', pkg.name],
  ['version', pkg.version],
  ['publisher', pkg.publisher],
  ['displayName', pkg.displayName],
  ['description', !!pkg.description],
  ['icon', pkg.icon],
  ['license', pkg.license],
  ['categories', pkg.categories?.length > 0],
  ['engines.vscode', pkg.engines?.vscode],
];
let pass = true;
checks.forEach(([field, val]) => {
  const ok = !!val;
  console.log(ok ? '  ✓' : '  ✗', field + ':', val || 'MISSING');
  if (!ok) pass = false;
});
if (!pass) process.exit(1);
console.log('Validation: PASS');
"
echo ""

# --- STEP 3: VS Code Marketplace ---
echo "=== Step 3: VS Code Marketplace ==="
if [ -n "${VSCE_PAT:-}" ]; then
  echo "Publishing to VS Code Marketplace..."
  npx vsce publish -p "$VSCE_PAT"
  echo "VS Code Marketplace: Published"
else
  echo "VSCE_PAT not set — skipping VS Code Marketplace"
  echo "  Set: export VSCE_PAT=your_azure_pat"
  echo "  Or manually upload: $VSIX_FILE"
  echo "  At: https://marketplace.visualstudio.com/manage"
fi
echo ""

# --- STEP 4: Open VSX ---
echo "=== Step 4: Open VSX Registry ==="
if [ -n "${OVSX_PAT:-}" ]; then
  echo "Publishing to Open VSX..."
  ovsx publish "$VSIX_FILE" -p "$OVSX_PAT"
  echo "Open VSX: Published"
else
  echo "OVSX_PAT not set — skipping Open VSX"
  echo "  Set: export OVSX_PAT=your_openvsx_token"
  echo "  Or manually upload: $VSIX_FILE"
  echo "  At: https://open-vsx.org (sign in with GitHub)"
fi
echo ""

# --- STEP 5: Self-hosted Download ---
echo "=== Step 5: Self-hosted Distribution ==="
DOWNLOAD_DIR="releases"
mkdir -p "$DOWNLOAD_DIR"
cp "$VSIX_FILE" "$DOWNLOAD_DIR/ina-coding-${VERSION}.vsix"
cp "$VSIX_FILE" "$DOWNLOAD_DIR/ina-coding-latest.vsix"
echo "Copied to: $DOWNLOAD_DIR/"
echo "  Serve from: https://inagpt.com/downloads/ina-coding-latest.vsix"
echo ""

# --- Summary ---
echo "=========================================="
echo "  Publish Summary — v$VERSION"
echo "=========================================="
echo ""
echo "  VSIX: $VSIX_FILE ($(du -sh "$VSIX_FILE" | cut -f1))"
echo ""
echo "  VS Code Marketplace: ${VSCE_PAT:+Published}${VSCE_PAT:-Skipped (no VSCE_PAT)}"
echo "  Open VSX Registry:   ${OVSX_PAT:+Published}${OVSX_PAT:-Skipped (no OVSX_PAT)}"
echo "  Self-hosted:         $DOWNLOAD_DIR/"
echo ""
echo "  Install commands:"
echo "    VS Code:   code --install-extension inagpt.ina-coding"
echo "    VS Codium: codium --install-extension inagpt.ina-coding"
echo "    From VSIX: code --install-extension $VSIX_FILE"
echo ""
echo "=========================================="
