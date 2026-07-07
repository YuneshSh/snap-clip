#!/usr/bin/env bash
#
# Removes Linux native host registrations.
#
set -euo pipefail

HOST_NAME="com.snapclip.clipboard"

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

for base in "${TARGETS[@]}"; do
  manifest="$base/NativeMessagingHosts/$HOST_NAME.json"
  if [ -f "$manifest" ]; then
    rm -f "$manifest"
    echo "Removed -> $manifest"
  fi
done

echo "Done."
