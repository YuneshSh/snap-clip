#!/usr/bin/env python3
"""
SnapClip native clipboard monitor (Linux / Windows).

Chrome Native Messaging host that polls the OS clipboard and streams new images
and text to the SnapClip extension. Protocol matches snapclip-clipboard-host.swift.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import platform
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
from typing import Optional

try:
    from PIL import Image
except ImportError:
    print("[snapclip-host] Pillow is required. Run: python3 -m pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

IMAGE_CHUNK_SIZE = 512 * 1024
TEXT_CHUNK_SIZE = 100_000
POLL_INTERVAL_SEC = 0.2
HEARTBEAT_INTERVAL_SEC = 20.0

_write_lock = threading.Lock()
_stdout = sys.stdout.buffer
_stdin = sys.stdin.buffer


def log(msg: str) -> None:
    print(f"[snapclip-host] {msg}", file=sys.stderr, flush=True)


def send_message(obj: dict) -> None:
    data = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    header = struct.pack("<I", len(data))
    with _write_lock:
        _stdout.write(header)
        _stdout.write(data)
        _stdout.flush()


def read_loop() -> None:
    while True:
        header = _stdin.read(4)
        if len(header) < 4:
            sys.exit(0)
        (n,) = struct.unpack("<I", header)
        if n <= 0:
            continue
        body = b""
        while len(body) < n:
            chunk = _stdin.read(n - len(body))
            if not chunk:
                sys.exit(0)
            body += chunk


def png_bytes_from_image(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    img.save(buf, format="PNG")
    return buf.getvalue()


def run_command(args: list[str], timeout: float = 2.0) -> Optional[bytes]:
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or not result.stdout:
        return None
    return result.stdout


def clipboard_png_linux() -> Optional[bytes]:
    # Wayland first.
    if shutil.which("wl-paste"):
        for mime in ("image/png", "image/bmp", "image/jpeg"):
            data = run_command(["wl-paste", "-t", mime])
            if not data:
                continue
            if mime == "image/png":
                return data
            try:
                return png_bytes_from_image(Image.open(io.BytesIO(data)))
            except OSError:
                continue

    # X11 fallback.
    if shutil.which("xclip"):
        for args in (
            ["xclip", "-selection", "clipboard", "-t", "image/png", "-o"],
            ["xclip", "-selection", "clipboard", "-t", "image/bmp", "-o"],
        ):
            data = run_command(args)
            if not data:
                continue
            if args[-2] == "image/png":
                return data
            try:
                return png_bytes_from_image(Image.open(io.BytesIO(data)))
            except OSError:
                continue

    return None


def clipboard_text_linux() -> Optional[str]:
    if shutil.which("wl-paste"):
        data = run_command(["wl-paste", "-n"])
        if data is not None:
            return data.decode("utf-8", errors="replace")
    if shutil.which("xclip"):
        data = run_command(["xclip", "-selection", "clipboard", "-o"])
        if data is not None:
            return data.decode("utf-8", errors="replace")
    return None


def clipboard_png_windows() -> Optional[bytes]:
    try:
        from PIL import ImageGrab
    except ImportError:
        return None

    try:
        result = ImageGrab.grabclipboard()
    except OSError:
        return None

    if result is None:
        return None

    if isinstance(result, list):
        for path in result:
            try:
                with Image.open(path) as img:
                    return png_bytes_from_image(img)
            except OSError:
                continue
        return None

    return png_bytes_from_image(result)


def clipboard_text_windows() -> Optional[str]:
    try:
        import win32clipboard  # type: ignore
    except ImportError:
        return None

    try:
        win32clipboard.OpenClipboard()
        try:
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                text = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                return text if isinstance(text, str) else None
        finally:
            win32clipboard.CloseClipboard()
    except OSError:
        return None
    return None


def current_clipboard_png() -> Optional[bytes]:
    system = platform.system()
    if system == "Windows":
        return clipboard_png_windows()
    if system == "Linux":
        return clipboard_png_linux()
    return None


def current_clipboard_text() -> Optional[str]:
    system = platform.system()
    if system == "Windows":
        return clipboard_text_windows()
    if system == "Linux":
        return clipboard_text_linux()
    return None


def fingerprint(png: Optional[bytes], text: Optional[str]) -> Optional[str]:
    h = hashlib.sha256()
    if png:
        h.update(b"img:")
        h.update(png)
        return h.hexdigest()
    if text is not None:
        stripped = text.strip()
        if not stripped:
            return None
        h.update(b"txt:")
        h.update(stripped.encode("utf-8"))
        return h.hexdigest()
    return None


def send_chunked(kind: str, payload: str) -> None:
    if kind == "image":
        data = payload.encode("utf-8")
        chunk_size = IMAGE_CHUNK_SIZE
    else:
        chars = list(payload)
        total = max(1, (len(chars) + TEXT_CHUNK_SIZE - 1) // TEXT_CHUNK_SIZE)
        msg_id = str(uuid.uuid4())
        index = 0
        start = 0
        while start < len(chars):
            end = min(start + TEXT_CHUNK_SIZE, len(chars))
            send_message({
                "type": "text",
                "id": msg_id,
                "index": index,
                "total": total,
                "chunk": "".join(chars[start:end]),
                "last": end >= len(chars),
            })
            index += 1
            start = end
        return

    total = max(1, (len(data) + chunk_size - 1) // chunk_size)
    msg_id = str(uuid.uuid4())
    index = 0
    start = 0
    while start < len(data):
        end = min(start + chunk_size, len(data))
        send_message({
            "type": kind,
            "id": msg_id,
            "index": index,
            "total": total,
            "chunk": data[start:end].decode("utf-8"),
            "last": end >= len(data),
        })
        index += 1
        start = end


def send_image(png: bytes) -> None:
    data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    send_chunked("image", data_url)


def send_text(text: str) -> None:
    send_chunked("text", text)


def emit_clipboard(last_fp: Optional[str]) -> Optional[str]:
    png = current_clipboard_png()
    if png:
        fp = fingerprint(png, None)
        if fp and fp != last_fp:
            send_image(png)
            return fp
        return last_fp

    text = current_clipboard_text()
    if text and text.strip():
        fp = fingerprint(None, text)
        if fp and fp != last_fp:
            send_text(text)
            return fp
    return last_fp


def main() -> None:
    system = platform.system()
    if system not in ("Linux", "Windows"):
        log(f"unsupported platform: {system} (use install.sh on macOS)")
        sys.exit(1)

    log(f"starting on {system}")
    threading.Thread(target=read_loop, daemon=True).start()
    send_message({"type": "hello", "version": "1.0.0"})

    last_fp: Optional[str] = None
    png = current_clipboard_png()
    if png:
        send_image(png)
        last_fp = fingerprint(png, None)
    else:
        text = current_clipboard_text()
        if text and text.strip():
            send_text(text)
            last_fp = fingerprint(None, text)

    last_heartbeat = time.monotonic()
    while True:
        last_fp = emit_clipboard(last_fp)
        now = time.monotonic()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
            send_message({"type": "heartbeat"})
            last_heartbeat = now
        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
