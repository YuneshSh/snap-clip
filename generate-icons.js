/**
 * Generates PNG icon files for the Chrome extension.
 * Run: node generate-icons.js
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(size) {
  // Draw a camera-like icon on a teal background
  const pixels = Buffer.alloc(size * size * 4);

  const bg   = [20, 184, 166, 255]; // teal-500
  const fg   = [255, 255, 255, 255]; // white

  const cx = size / 2, cy = size / 2;
  const r1  = size * 0.30; // lens outer
  const r2  = size * 0.18; // lens inner
  const bodyH = size * 0.55, bodyW = size * 0.78;
  const bodyTop = cy - bodyH * 0.42;

  function setPixel(x, y, c) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]   = c[0];
    pixels[i+1] = c[1];
    pixels[i+2] = c[2];
    pixels[i+3] = c[3];
  }

  // Fill background
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) setPixel(x, y, bg);

  // Draw rounded camera body (filled rectangle approximation)
  const brad = size * 0.08;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x - (cx - bodyW / 2), ly = y - bodyTop;
      const rx = bodyW - lx, ry = bodyH - ly;
      if (lx >= 0 && ly >= 0 && rx >= 0 && ry >= 0) {
        const corner =
          (lx < brad && ly < brad && Math.hypot(lx - brad, ly - brad) > brad) ||
          (rx < brad && ly < brad && Math.hypot(rx - brad, ly - brad) > brad) ||
          (lx < brad && ry < brad && Math.hypot(lx - brad, ry - brad) > brad) ||
          (rx < brad && ry < brad && Math.hypot(rx - brad, ry - brad) > brad);
        if (!corner) setPixel(x, y, fg);
      }
    }
  }

  // Viewfinder bump at top
  const bw = size * 0.20, bh = size * 0.10;
  const bx = cx - bw / 2, by = bodyTop - bh + 1;
  for (let y = Math.round(by); y < Math.round(by + bh); y++)
    for (let x = Math.round(bx); x < Math.round(bx + bw); x++)
      setPixel(x, y, fg);

  // Lens outer circle (teal hole)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (Math.hypot(x - cx, y - cy) < r1) setPixel(x, y, bg);

  // Lens inner circle (white)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (Math.hypot(x - cx, y - cy) < r2) setPixel(x, y, fg);

  // RGBA -> RGB rows with filter byte
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter None
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const dir = path.join(__dirname, 'extension', 'icons');
fs.mkdirSync(dir, { recursive: true });

for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon${size}.png`), makePNG(size));
  console.log(`Created icon${size}.png (${size}x${size})`);
}

console.log('Icons generated successfully.');
