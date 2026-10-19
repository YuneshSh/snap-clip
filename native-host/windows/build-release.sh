#!/usr/bin/env bash
#
# Package SnapClip Companion for Windows (ZIP).
# Run on any OS. Include a prebuilt .exe (from build-exe.ps1 / CI) when available.
#
# Usage:
#   ./native-host/windows/build-release.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE="$(cd "$ROOT/.." && pwd)"
VERSION="${VERSION:-$(tr -d '[:space:]' < "$ROOT/VERSION")}"
DIST="$ROOT/dist"
STAGE="$DIST/stage"
PRODUCT="SnapClip-Companion-Windows"
ZIP_NAME="${PRODUCT}-${VERSION}.zip"

rm -rf "$DIST"
mkdir -p "$STAGE"

cp "$ROOT/install-user.ps1" "$STAGE/"
cp "$ROOT/uninstall-user.ps1" "$STAGE/"
cp "$ROOT/run-host.bat" "$STAGE/"
cp "$ROOT/VERSION" "$STAGE/"
cp "$NATIVE/snapclip-clipboard-host.py" "$STAGE/"
cp "$NATIVE/requirements.txt" "$STAGE/"

if [[ -f "$ROOT/snapclip-clipboard-host.exe" ]]; then
  cp "$ROOT/snapclip-clipboard-host.exe" "$STAGE/"
  echo "Including prebuilt snapclip-clipboard-host.exe"
else
  echo "NOTE: no .exe present — ZIP will require Python 3 on the user's PC."
  echo "      Build on Windows with: powershell -ExecutionPolicy Bypass -File native-host/windows/build-exe.ps1"
  echo "      Or run the GitHub Action 'companion-windows'."
fi

cat > "$STAGE/README.txt" <<EOF
SnapClip Companion for Windows (v${VERSION})

Easy install (PowerShell):
  See the SnapClip companion page for a one-line install command.

Manual:
  1. Right-click install-user.ps1 → Run with PowerShell
     (or: powershell -ExecutionPolicy Bypass -File install-user.ps1)
  2. Fully quit Chrome and reopen it
  3. SnapClip → Check connection

If snapclip-clipboard-host.exe is in this folder, Python is NOT required.
Otherwise install Python 3.9+ from python.org (Add to PATH).
EOF

(
  cd "$STAGE"
  zip -qr "$DIST/$ZIP_NAME" .
)
cp "$DIST/$ZIP_NAME" "$DIST/${PRODUCT}.zip"
(
  cd "$DIST"
  shasum -a 256 "$ZIP_NAME" "${PRODUCT}.zip" > SHA256SUMS.txt
)

echo ""
echo "Done. Artifacts in $DIST:"
ls -lh "$DIST"/*.zip "$DIST"/SHA256SUMS.txt
echo ""
echo "Upload to GitHub Releases as: ${PRODUCT}.zip"
echo "  https://github.com/YuneshSh/snap-clip/releases/latest/download/${PRODUCT}.zip"
