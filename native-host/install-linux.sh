#!/usr/bin/env bash
#
# Builds dependencies and registers the SnapClip Python native host with
# Chromium browsers on Linux.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.snapclip.clipboard"
TEMPLATE="$DIR/$HOST_NAME.json"
LAUNCHER="$DIR/run-host.sh"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found. Install Python 3.9+." >&2
  exit 1
fi

echo "Installing Python dependencies..."
python3 -m pip install --user -r "$DIR/requirements.txt"

chmod +x "$DIR/snapclip-clipboard-host.py" "$LAUNCHER"

if ! command -v wl-paste >/dev/null 2>&1 && ! command -v xclip >/dev/null 2>&1; then
  echo "warning: install wl-clipboard (Wayland) or xclip (X11) for clipboard access." >&2
  echo "  Debian/Ubuntu: sudo apt install wl-clipboard   # or: xclip" >&2
  echo "  Fedora:        sudo dnf install wl-clipboard   # or: xclip" >&2
fi

TARGETS=(
  "$HOME/.config/google-chrome"
  "$HOME/.config/google-chrome-beta"
  "$HOME/.config/google-chrome-unstable"
  "$HOME/.config/chromium"
  "$HOME/.config/BraveSoftware/Brave-Browser"
  "$HOME/.config/microsoft-edge"
  "$HOME/.config/microsoft-edge-beta"
  "$HOME/.config/microsoft-edge-dev"
  "$HOME/.config/vivaldi"
  "$HOME/.config/opera"
)

installed=0
for base in "${TARGETS[@]}"; do
  if [ -d "$base" ]; then
    dest="$base/NativeMessagingHosts"
    mkdir -p "$dest"
    sed "s|__HOST_PATH__|$LAUNCHER|g" "$TEMPLATE" > "$dest/$HOST_NAME.json"
    echo "Registered -> $dest/$HOST_NAME.json"
    installed=$((installed + 1))
  fi
done

if [ "$installed" -eq 0 ]; then
  echo "warning: no supported browser profile found under ~/.config" >&2
fi

echo ""
echo "Done. Fully quit and reopen your browser (or reload SnapClip at chrome://extensions)."
