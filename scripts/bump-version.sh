#!/bin/bash
set -euo pipefail

TYPE=${1:-patch}  # major, minor, patch

echo "Bumping version ($TYPE)..."

# Read current version
CURRENT=$(node -e "console.log(require('./package.json').version)")
echo "Current: $CURRENT"

# Bump
npm version $TYPE --no-git-tag-version

# Read new version
NEW=$(node -e "console.log(require('./package.json').version)")
echo "New: $NEW"

# Also update webview-ui version
cd webview-ui
npm version $NEW --no-git-tag-version --allow-same-version 2>/dev/null || true
cd ..

echo ""
echo "Version bumped: $CURRENT → $NEW"
echo ""
echo "Next steps:"
echo "1. Update CHANGELOG.md with new version changes"
echo "2. Build and test: ./scripts/publish.sh"
echo "3. Commit: git commit -am 'Release v$NEW'"
echo "4. Tag: git tag v$NEW"
echo "5. Publish: vsce publish"
