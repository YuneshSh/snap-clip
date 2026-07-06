# SnapClip Native Companion (macOS)

A tiny Native Messaging host that watches the macOS clipboard **even when your
browser isn't focused** and streams any copied image straight into the SnapClip
extension. This is what enables capturing back-to-back screenshots from tools
like **Xnip**, **CleanShot**, or `Cmd-Shift-4` without opening the popup each
time.

## Why this is needed

A browser extension can only read the clipboard while a browser tab is focused.
When you snip repeatedly in another app, the OS clipboard only holds the **last**
image, and the browser never sees the earlier ones. This native helper runs
outside the browser, polls the clipboard ~5×/second, and forwards every new
image to the extension over Chrome's Native Messaging channel.

## Requirements

- macOS with **Xcode Command Line Tools** (provides `swiftc`).
  Install with: `xcode-select --install`
- The SnapClip extension loaded in a Chromium browser (Chrome, Brave, Edge,
  Arc, Chromium, Vivaldi).

## Install

```bash
cd native-host
./install.sh
```

This will:

1. Compile `snapclip-clipboard-host.swift` → `snapclip-clipboard-host` (arm64/x86_64 native).
2. Register the Native Messaging manifest (`com.snapclip.clipboard.json`) for
   every supported browser found on your Mac, pointing at the compiled binary.

Then **fully quit and reopen your browser** (or reload SnapClip at
`chrome://extensions`). The extension auto-connects and reconnects on its own.

> The manifest is locked to the extension ID
> `doeoikmjihhhbemlbkjohmlmcdjffoel`, which is pinned via the `key` field in the
> extension's `manifest.json`, so the ID stays stable across machines and reloads.

## Verify it's working

1. Open SnapClip's popup once so the service worker is alive.
2. Take a screenshot to the clipboard from any app (e.g. `Cmd-Shift-4`).
3. It should appear in SnapClip without opening the popup or clicking paste.

To watch host logs, run it manually — it prints diagnostics to stderr:

```bash
./snapclip-clipboard-host
```

(Ctrl-C to stop. Note it only *sends* to the extension when launched by the
browser; running it by hand is just for checking it starts.)

## Uninstall

```bash
cd native-host
./uninstall.sh
```

## How it works

- **Protocol:** Native Messaging frames = 4-byte little-endian length prefix +
  UTF-8 JSON.
- **Clipboard:** polls `NSPasteboard.general.changeCount`; on change it extracts
  a PNG (converting from TIFF or a copied image file if needed).
- **Chunking:** Chrome caps a single host→extension message at ~1 MB, so images
  are base64-split into 512 KB chunks (`{type:"image", id, index, total, chunk,
  last}`) and the extension reassembles them in `background.js`.
- **Keep-alive:** a `heartbeat` every ~20s keeps the MV3 service worker from
  going idle so the port stays open. The extension also reconnects via a
  `chrome.alarms` fallback and exponential backoff.

## Files

| File | Purpose |
|------|---------|
| `snapclip-clipboard-host.swift` | The native host source. |
| `com.snapclip.clipboard.json` | Native Messaging manifest template (`__HOST_PATH__` is filled in at install). |
| `install.sh` / `uninstall.sh` | Build + register / remove. |
