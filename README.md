# SnapClip

A Chrome/Chromium extension that saves copied screenshots so you can re-copy,
download, or delete them later.

## Extension

Load **`unpacked/`** as an unpacked extension at `chrome://extensions` (enable
Developer Mode → "Load unpacked"). Do not load `extension/` — Chrome already
has two leftover IDs for that folder, which is why SnapClip vanishes on
restart. Leave Developer Mode on.

After copying changes from `extension/` into `unpacked/`, reload the extension.
Expected ID for `unpacked/` on this machine:
`lghlilkcfmckhgikebafnmiimkhbofpc`.

## Native companion — back-to-back screenshot capture

By default the extension can only grab the clipboard while a browser tab is
focused. The **native companion** watches the clipboard system-wide and streams
every image (and text) into SnapClip automatically.

| OS | Install |
|----|---------|
| **macOS / Linux** | `cd native-host && ./install.sh` |
| **Windows** | `cd native-host` then `powershell -ExecutionPolicy Bypass -File install-windows.ps1` |

See [`native-host/README.md`](native-host/README.md) for platform requirements
(Python + wl-clipboard/xclip on Linux, Python + pywin32 on Windows).

## Preview (dev)

```bash
npm install
npm run dev
```

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-qzqh1qo3)
