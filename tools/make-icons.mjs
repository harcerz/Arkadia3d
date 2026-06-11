#!/usr/bin/env node
// Generuje ikony PWA (PNG bez zależności — własny enkoder przez zlib)
// oraz favicon.svg. Motyw: izometryczny kafelek lokacji z markerem gracza.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtr: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

// Rysowanie: izometryczny romb (kafelek) + stożek-marker gracza.
function drawIcon(size, padding = 0) {
  const img = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a;
  };
  // tło
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) set(x, y, 16, 16, 24);
  }
  const cx = size / 2;
  const cy = size * 0.58;
  const w = size * (0.42 - padding);
  const h = w * 0.55;
  // romb (kafelek) z cieniowaniem
  for (let y = -h; y <= h; y++) {
    for (let x = -w; x <= w; x++) {
      if (Math.abs(x) / w + Math.abs(y) / h <= 1) {
        const edge = Math.abs(x) / w + Math.abs(y) / h > 0.86;
        const px = Math.round(cx + x);
        const py = Math.round(cy + y);
        if (edge) set(px, py, 101, 214, 255);
        else {
          const shade = 1 - (y + h) / (4 * h);
          set(px, py, Math.round(45 * shade + 30), Math.round(120 * shade + 40), Math.round(90 * shade + 60));
        }
      }
    }
  }
  // stożek gracza
  const coneH = size * (0.34 - padding);
  const coneW = size * (0.13 - padding * 0.3);
  const baseY = cy - h * 0.15;
  for (let y = 0; y < coneH; y++) {
    const half = coneW * (y / coneH);
    for (let x = -half; x <= half; x++) {
      const glow = 1 - y / coneH;
      set(Math.round(cx + x), Math.round(baseY - coneH + y),
        Math.round(120 + 100 * glow), Math.round(200 + 30 * glow), 255);
    }
  }
  return img;
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'icon-192.png'), encodePng(192, 192, drawIcon(192)));
await writeFile(join(OUT, 'icon-512.png'), encodePng(512, 512, drawIcon(512)));
await writeFile(join(OUT, 'icon-maskable-512.png'), encodePng(512, 512, drawIcon(512, 0.1)));

await writeFile(join(OUT, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="#101018"/>
<path d="M32 22 L56 37 L32 52 L8 37 Z" fill="#2c6e5a" stroke="#65d6ff" stroke-width="2"/>
<path d="M32 8 L40 30 L24 30 Z" fill="#9adcff"/>
</svg>
`);
console.log('OK: ikony zapisane w icons/');
