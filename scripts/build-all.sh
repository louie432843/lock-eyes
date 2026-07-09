#!/usr/bin/env bash
#
# build:all — Build installers for Linux, Windows, and macOS in one shot.
#
# Usage:
#   npm run build:all
#
# Output:
#   release/Lock Eyes-0.1.0.AppImage        (Linux)
#   release/Lock Eyes Setup 0.1.0.exe        (Windows NSIS installer)
#   release/Lock-Eyes-0.1.0-mac.tar.gz       (macOS .app in a tarball)
#
# Requirements:
#   - Node.js, npm
#   - electron-builder (installed as devDependency)
#
# Note: Building a macOS DMG requires running on macOS (dmg-license depends
# on iconv-corefoundation which is darwin-only). On non-macOS systems, we
# build the .app and tarball it instead. On macOS, a proper DMG is generated.
#

set -euo pipefail

echo "========================================"
echo "  Lock Eyes — Build all installers"
echo "========================================"

# Ensure Vite production assets are built first
echo ""
echo "[1/4] Building Vite production assets..."
node -e "require('vite').build({mode:'production'}).then(()=>console.log('  Vite build OK')).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
echo "  ✓ Vite build complete"

# Linux
echo ""
echo "[2/4] Building Linux AppImage..."
npx electron-builder --linux --x64
echo "  ✓ Linux build complete"

# Windows
echo ""
echo "[3/4] Building Windows NSIS installer..."
npx electron-builder --win --x64
echo "  ✓ Windows build complete"

# macOS
echo ""
echo "[4/4] Building macOS app..."
if [[ "$(uname)" == "Darwin" ]]; then
  # On macOS we can build a proper DMG
  npx electron-builder --mac --x64
  echo "  ✓ macOS DMG complete"
else
  # On Linux/Windows, build .app and tarball it (can't create DMG)
  npx electron-builder --mac dir --x64
  cd release
  tar czf "Lock-Eyes-0.1.0-mac.tar.gz" mac/
  cd ..
  echo "  ✓ macOS .app tarball complete (DMG requires macOS)"
fi

echo ""
echo "========================================"
echo "  All installers built!"
echo "========================================"
echo ""
echo "Output in release/:"
ls -lh release/*.AppImage release/*.exe release/*.tar.gz release/*.dmg 2>/dev/null || true
echo ""
echo "Done."