#!/usr/bin/env bash
#
# Removes the SnapClip native clipboard host and its browser registrations.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.snapclip.clipboard"
BIN="$DIR/snapclip-clipboard-host"

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

for base in "${TARGETS[@]}"; do
  manifest="$base/NativeMessagingHosts/$HOST_NAME.json"
  if [ -f "$manifest" ]; then
    rm -f "$manifest"
    echo "Removed -> $manifest"
  fi
done

if [ -f "$BIN" ]; then
  rm -f "$BIN"
  echo "Removed -> $BIN"
fi

echo "Done."
