# SnapClip

A Chrome/Chromium extension that saves copied screenshots so you can re-copy,
download, or delete them later.

## Extension

Load `extension/` as an unpacked extension at `chrome://extensions` (enable
Developer Mode → "Load unpacked"). Leave Developer Mode on — Chrome 134+
disables unpacked extensions if that toggle is off.

Do **not** add a `key` to `manifest.json` while testing unpacked. A leftover
`key` made Chrome register SnapClip twice for the same folder, so it vanished
on every browser restart. Chrome now derives a stable ID from this folder path
(`cibfbcjggdbgdmllckalpjjicpoioheb`). Do not move or rename `extension/`
without reinstalling the native companion.

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
