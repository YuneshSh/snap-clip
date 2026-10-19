# SnapClip Native Companion

A Native Messaging host that watches the system clipboard **even when Chrome is
closed or unfocused** and streams copied images and text into SnapClip. This is
the headline **Pro** feature — Free captures only while a browser tab is
focused; Pro + this companion enables true system-wide capture.

## Platform support

| Platform | Host | Install |
|----------|------|---------|
| **macOS** | Swift (`snapclip-clipboard-host.swift`) | **DMG / PKG** (recommended) or `./install.sh` |
| **Linux** | Python 3 (`snapclip-clipboard-host.py`) | `./install-linux.sh` or `./install.sh` |
| **Windows** | Python 3 or bundled `.exe` | **ZIP** (recommended) or `install-windows.ps1` |

### macOS for end users (no Xcode)

1. Download [`SnapClip-Companion-macOS.dmg`](https://github.com/YuneshSh/snap-clip/releases/latest/download/SnapClip-Companion-macOS.dmg)
2. Open it → double-click **Install SnapClip Companion**
3. Fully quit and reopen Chrome
4. SnapClip → **Check connection**

Xcode is **not** required for the DMG/PKG path. Command Line Tools are only needed if you build from source with `./install.sh`.

### Build the macOS DMG / PKG (maintainers)

On a Mac with Xcode Command Line Tools:

```bash
cd native-host/macos
./build-release.sh
# optional: VERSION=1.0.1 ./build-release.sh
```

Artifacts land in `native-host/macos/dist/`:

- `SnapClip-Companion-macOS.dmg` — Installer.app + optional .pkg
- `SnapClip-Companion-macOS.pkg` — system-wide install
- `SHA256SUMS.txt`

Upload those files to a GitHub Release (same asset names). Bump `native-host/macos/VERSION` when shipping.

The top-level `./install.sh` still compiles from source for developers.

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

### Windows for end users

PowerShell one-liner (same idea as macOS):

```powershell
$z="$env:TEMP\SnapClip-Companion-Windows.zip"; $d="$env:TEMP\SnapClip-Companion-Windows"; Invoke-WebRequest -Uri "https://github.com/YuneshSh/snap-clip/releases/latest/download/SnapClip-Companion-Windows.zip" -OutFile $z; Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive $z $d -Force; powershell -ExecutionPolicy Bypass -File "$d\install-user.ps1"
```

Or download [`SnapClip-Companion-Windows.zip`](https://github.com/YuneshSh/snap-clip/releases/latest/download/SnapClip-Companion-Windows.zip) and run `install-user.ps1`.

If the ZIP includes `snapclip-clipboard-host.exe`, **Python is not required**. Otherwise install Python 3.9+ (Add to PATH).

### Build the Windows ZIP / exe (maintainers)

```bash
# Package ZIP (any OS; includes .exe if present beside the scripts)
./native-host/windows/build-release.sh

# Build .exe on Windows (or via GitHub Action companion-windows)
powershell -ExecutionPolicy Bypass -File native-host/windows/build-exe.ps1
./native-host/windows/build-release.sh
```

From a repo checkout (developers):

```powershell
cd native-host
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

Then **fully quit and reopen your browser**. The header dot turns green when linked.

> The host allowlists (see `com.snapclip.clipboard.json`):
> - `felceegmoadjlpodhpdpcpiidgafnlid` — Chrome Web Store / published ID
> - `lklehcjpnlhnghobjoldmfdeobjcnoej` — stable ID from the manifest `key` (local `unpacked/`)
> - older path-based IDs for local legacy installs
>
> Load **`unpacked/`** in Chrome for local dev (sync with `./scripts/sync-unpacked.sh`).
> After changing origins, re-run the companion installer so browser manifests update.

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
