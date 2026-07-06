# SnapClip

A Chrome/Chromium extension that saves copied screenshots so you can re-copy,
download, or delete them later.

## Extension

Load `extension/` as an unpacked extension at `chrome://extensions` (enable
Developer Mode → "Load unpacked"). The extension ID is pinned to
`doeoikmjihhhbemlbkjohmlmcdjffoel` via the `key` in `manifest.json`.

## Native companion (macOS) — back-to-back screenshot capture

By default the extension can only grab the clipboard while a browser tab is
focused, so rapid screenshots taken in another app (Xnip, CleanShot,
`Cmd-Shift-4`) get lost. The **native companion** watches the clipboard system-
wide and streams every image into SnapClip automatically.

```bash
cd native-host
./install.sh
```

See [`native-host/README.md`](native-host/README.md) for details.

## Preview (dev)

```bash
npm install
npm run dev
```

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-qzqh1qo3)
