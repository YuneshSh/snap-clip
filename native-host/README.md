# SnapClip Native Companion

A Native Messaging host that watches the system clipboard **even when your
browser isn't focused** and streams copied images and text into the SnapClip
extension. This enables back-to-back screenshots from external tools without
opening the popup each time.

## Platform support

| Platform | Host | Install |
|----------|------|---------|
| **macOS** | Swift (`snapclip-clipboard-host.swift`) | `./install.sh` |
| **Linux** | Python 3 (`snapclip-clipboard-host.py`) | `./install-linux.sh` or `./install.sh` |
| **Windows** | Python 3 (`snapclip-clipboard-host.py`) | `powershell -ExecutionPolicy Bypass -File install-windows.ps1` |

The top-level `./install.sh` dispatches to macOS or Linux automatically.

## Why this is needed

A browser extension can only read the clipboard while a browser tab is focused.
When you capture repeatedly in another app, the OS clipboard only holds the **last**
item. This native helper polls the clipboard ~5×/second and forwards every new
image or text snippet to the extension over Chrome's Native Messaging channel.

## Requirements

### macOS
- Xcode Command Line Tools (`xcode-select --install`)
- Chromium browser (Chrome, Brave, Edge, Arc, Chromium, Vivaldi)

### Linux
- Python 3.9+
- **Pillow** (`pip install -r requirements.txt`)
- Clipboard tool: **wl-clipboard** (Wayland) and/or **xclip** (X11)
  - Debian/Ubuntu: `sudo apt install wl-clipboard` or `sudo apt install xclip`
  - Fedora: `sudo dnf install wl-clipboard` or `sudo dnf install xclip`

### Windows
- Python 3.9+ from [python.org](https://www.python.org/downloads/) (enable **Add to PATH**)
- **Pillow** and **pywin32** (installed via `requirements.txt`)

## Install

### macOS / Linux

```bash
cd native-host
./install.sh          # macOS → Swift build; Linux → install-linux.sh
```

Or on Linux directly:

```bash
cd native-host
./install-linux.sh
```

### Windows

Open PowerShell in the `native-host` folder:

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

Then **fully quit and reopen your browser** (or reload SnapClip at
`chrome://extensions`). The extension auto-connects; the header dot turns green
when the companion is linked.

> The host allows:
> `lghlilkcfmckhgikebafnmiimkhbofpc` (`unpacked/` on this machine),
> `cibfbcjggdbgdmllckalpjjicpoioheb` (old `extension/` path), and
> `doeoikmjihhhbemlbkjohmlmcdjffoel` (legacy keyed ID).
> If you move the folder, check the ID on `chrome://extensions`, add that
> origin here, and re-run the installer.

## Verify

1. Open SnapClip's popup once so the service worker is alive.
2. Copy a screenshot to the clipboard from any app.
3. It should appear in SnapClip without clicking Paste.

Host logs go to **stderr** (visible in `chrome://extensions` → SnapClip →
"Service worker" → Inspect, or when running the host manually).

## Uninstall

```bash
# macOS / Linux
cd native-host
./uninstall.sh
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File uninstall-windows.ps1
```

## Protocol

- **Framing:** 4-byte little-endian length + UTF-8 JSON (Chrome Native Messaging).
- **Messages:** `hello`, `heartbeat`, chunked `image` / `text` payloads.
- **Chunking:** Images are base64-split into 512 KB chunks; the extension
  reassembles them in `extension/background.js`.

## Files

| File | Purpose |
|------|---------|
| `snapclip-clipboard-host.swift` | macOS native host |
| `snapclip-clipboard-host.py` | Linux / Windows native host |
| `run-host.sh` / `run-host.bat` | Launchers registered with browsers |
| `com.snapclip.clipboard.json` | Manifest template (`__HOST_PATH__` on Unix) |
| `requirements.txt` | Python dependencies |
| `install.sh` / `install-linux.sh` / `install-windows.ps1` | Installers |
| `uninstall.sh` / `uninstall-linux.sh` / `uninstall-windows.ps1` | Uninstallers |
