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

# Prefer Info-ZIP; fall back to Python (Windows runners often lack `zip`).
make_zip() {
  local out="$1"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$out" .
    return
  fi
  python - "$out" <<'PY'
import sys, zipfile
from pathlib import Path
out = Path(sys.argv[1])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in Path(".").rglob("*"):
        if path.is_file():
            zf.write(path, path.as_posix())
PY
}

(
  cd "$STAGE"
  make_zip "$DIST/$ZIP_NAME"
)
cp "$DIST/$ZIP_NAME" "$DIST/${PRODUCT}.zip"
(
  cd "$DIST"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$ZIP_NAME" "${PRODUCT}.zip" > SHA256SUMS.txt
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$ZIP_NAME" "${PRODUCT}.zip" > SHA256SUMS.txt
  else
    python - "$ZIP_NAME" "${PRODUCT}.zip" <<'PY'
import hashlib, pathlib, sys
lines = []
for name in sys.argv[1:]:
    data = pathlib.Path(name).read_bytes()
    lines.append(f"{hashlib.sha256(data).hexdigest()}  {name}")
pathlib.Path("SHA256SUMS.txt").write_text("\n".join(lines) + "\n")
PY
  fi
)

echo ""
echo "Done. Artifacts in $DIST:"
ls -lh "$DIST"/*.zip "$DIST"/SHA256SUMS.txt
echo ""
echo "Upload to GitHub Releases as: ${PRODUCT}.zip"
echo "  https://github.com/YuneshSh/snap-clip/releases/latest/download/${PRODUCT}.zip"
