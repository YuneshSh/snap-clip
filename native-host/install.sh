#!/usr/bin/env bash
#
# Installs the SnapClip native clipboard host for your OS.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$(uname -s)" in
  Linux)
    exec "$DIR/install-linux.sh"
    ;;
  Darwin)
    ;;
  *)
    echo "On Windows, run:" >&2
    echo "  powershell -ExecutionPolicy Bypass -File \"$DIR/install-windows.ps1\"" >&2
    exit 1
    ;;
esac

# ── macOS (Swift host) ───────────────────────────────────────────────────────
HOST_NAME="com.snapclip.clipboard"
SRC="$DIR/snapclip-clipboard-host.swift"
BIN="$DIR/snapclip-clipboard-host"
TEMPLATE="$DIR/$HOST_NAME.json"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "error: swiftc not found. Install Xcode Command Line Tools:  xcode-select --install" >&2
  exit 1
fi

echo "Building native host..."
swiftc -O -o "$BIN" "$SRC"
chmod +x "$BIN"
echo "  -> $BIN"

# NativeMessagingHosts dirs for the common Chromium browsers. We install into
# each browser that is actually present (its parent app-support dir exists).
TARGETS=(
  "$HOME/Library/Application Support/Google/Chrome"
  "$HOME/Library/Application Support/Google/Chrome Beta"
  "$HOME/Library/Application Support/Google/Chrome Canary"
  "$HOME/Library/Application Support/Google/Chrome Dev"
  "$HOME/Library/Application Support/Chromium"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
  "$HOME/Library/Application Support/Microsoft Edge"
  "$HOME/Library/Application Support/Arc/User Data"
  "$HOME/Library/Application Support/Vivaldi"
)

installed=0
for base in "${TARGETS[@]}"; do
  if [ -d "$base" ]; then
    dest="$base/NativeMessagingHosts"
    mkdir -p "$dest"
    sed "s|__HOST_PATH__|$BIN|g" "$TEMPLATE" > "$dest/$HOST_NAME.json"
    echo "Registered -> $dest/$HOST_NAME.json"
    installed=$((installed + 1))
  fi
done

if [ "$installed" -eq 0 ]; then
  echo "warning: no supported browser profile found. Is Chrome installed?" >&2
fi

echo ""
echo "Done. Now fully quit and reopen your browser (or reload the SnapClip"
echo "extension at chrome://extensions), and the clipboard monitor will connect."
