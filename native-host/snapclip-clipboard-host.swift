// SnapClip native clipboard monitor.
//
// A Chrome Native Messaging host that watches the macOS clipboard (NSPasteboard)
// even while the browser is unfocused, and streams any image that appears to the
// SnapClip extension. This is what makes back-to-back screenshots from tools like
// Xnip / Cmd-Shift-4 get captured without needing to open the popup each time.
//
// Native Messaging framing: each message is a 4-byte little-endian UInt32 length
// prefix followed by that many bytes of UTF-8 JSON. Chrome caps a single
// host -> extension message at ~1 MB, so images are base64-chunked and the
// extension reassembles them.

import Foundation
import AppKit

let stdoutHandle = FileHandle.standardOutput
let stdinHandle = FileHandle.standardInput

// Serialize writes so the read-thread (draining stdin) and the poll loop never
// interleave bytes on stdout.
let writeLock = NSLock()

func log(_ s: String) {
    FileHandle.standardError.write(Data(("[snapclip-host] " + s + "\n").utf8))
}

func sendMessage(_ obj: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(obj),
          let json = try? JSONSerialization.data(withJSONObject: obj) else { return }
    var length = UInt32(json.count).littleEndian
    let header = Data(bytes: &length, count: 4)
    writeLock.lock()
    stdoutHandle.write(header)
    stdoutHandle.write(json)
    writeLock.unlock()
}

// Drain incoming messages from Chrome on a background thread. We don't need to
// act on them, but reading lets us detect disconnect (EOF) and exit cleanly.
func startReadLoop() {
    Thread.detachNewThread {
        while true {
            let header = stdinHandle.readData(ofLength: 4)
            if header.count < 4 { exit(0) } // Chrome closed the port.
            let n = header.withUnsafeBytes { Int(UInt32(littleEndian: $0.load(as: UInt32.self))) }
            if n <= 0 { continue }
            var body = Data()
            while body.count < n {
                let chunk = stdinHandle.readData(ofLength: n - body.count)
                if chunk.isEmpty { exit(0) }
                body.append(chunk)
            }
        }
    }
}

// Pull a PNG out of the current clipboard, converting from TIFF if needed.
func currentClipboardPNG() -> Data? {
    let pb = NSPasteboard.general
    if let png = pb.data(forType: .png) {
        return png
    }
    if let tiff = pb.data(forType: .tiff), let rep = NSBitmapImageRep(data: tiff) {
        return rep.representation(using: .png, properties: [:])
    }
    // Some tools copy an image as a file reference rather than raw bitmap data.
    if let items = pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] {
        for url in items where ["png", "jpg", "jpeg", "gif", "tiff", "bmp", "heic"].contains(url.pathExtension.lowercased()) {
            if let data = try? Data(contentsOf: url), let rep = NSBitmapImageRep(data: data) {
                return rep.representation(using: .png, properties: [:])
            }
        }
    }
    return nil
}

func sendImage(_ png: Data) {
    let dataUrl = "data:image/png;base64," + png.base64EncodedString()
    let chars = Array(dataUrl.utf8) // base64 + prefix are all ASCII, 1 byte each.
    let chunkSize = 512 * 1024
    let total = max(1, (chars.count + chunkSize - 1) / chunkSize)
    var index = 0
    var start = 0
    let id = UUID().uuidString
    while start < chars.count {
        let end = min(start + chunkSize, chars.count)
        let piece = String(decoding: chars[start..<end], as: UTF8.self)
        sendMessage([
            "type": "image",
            "id": id,
            "index": index,
            "total": total,
            "chunk": piece,
            "last": end >= chars.count
        ])
        index += 1
        start = end
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
startReadLoop()
sendMessage(["type": "hello", "version": "1.0.0"])

let pb = NSPasteboard.general
var lastChangeCount = pb.changeCount

// Capture whatever is already on the clipboard at launch (the extension dedups).
if let png = currentClipboardPNG() { sendImage(png) }

var lastHeartbeat = Date()
while true {
    let cc = pb.changeCount
    if cc != lastChangeCount {
        lastChangeCount = cc
        if let png = currentClipboardPNG() {
            sendImage(png)
        }
    }
    // Heartbeat keeps the MV3 service worker from going idle so the port stays up.
    if Date().timeIntervalSince(lastHeartbeat) > 20 {
        sendMessage(["type": "heartbeat"])
        lastHeartbeat = Date()
    }
    usleep(200_000) // poll ~5x/sec; cheap since it only reads an integer.
}
