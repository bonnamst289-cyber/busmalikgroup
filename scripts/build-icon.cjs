const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const SUPERSAMPLE = 3;

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function insideRoundBox(u, v, x0, y0, x1, y1, r) {
  const dx = Math.abs(u - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
  const dy = Math.abs(v - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) <= r - 1e-9;
}

function insideCircle(u, v, cx, cy, r) {
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

const WINDOWS = [[0.225, 0.375], [0.395, 0.545], [0.565, 0.715]];

function sample(u, v) {
  if (!insideRoundBox(u, v, 0, 0, 1, 1, 0.22)) return null;
  let color = [27 + (13 - 27) * v, 59 + (33 - 59) * v, 107 + (64 - 107) * v];
  if (insideRoundBox(u, v, 0.17, 0.26, 0.83, 0.74, 0.10)) color = [244, 248, 253];
  for (const [x0, x1] of WINDOWS) {
    if (u >= x0 && u <= x1 && v >= 0.32 && v <= 0.47) color = [36, 104, 201];
  }
  if (u >= 0.17 && u <= 0.83 && v >= 0.60 && v <= 0.665) color = [32, 178, 119];
  for (const cx of [0.33, 0.67]) {
    if (insideCircle(u, v, cx, 0.74, 0.075)) color = [23, 38, 61];
    if (insideCircle(u, v, cx, 0.74, 0.030)) color = [158, 177, 205];
  }
  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2])];
}

function render(size) {
  const grid = size * SUPERSAMPLE;
  const output = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const color = sample((px * SUPERSAMPLE + sx + 0.5) / grid, (py * SUPERSAMPLE + sy + 0.5) / grid);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          hits += 1;
        }
      }
      const offset = (py * size + px) * 4;
      if (hits) {
        output[offset] = Math.round(r / hits);
        output[offset + 1] = Math.round(g / hits);
        output[offset + 2] = Math.round(b / hits);
        output[offset + 3] = Math.round((hits / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
      }
    }
  }
  return output;
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const directory = Buffer.alloc(images.length * 16);
  images.forEach((image, index) => {
    const entry = index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size;
    directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });
  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}

const assetDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetDir, { recursive: true });

const images = SIZES.map((size) => ({ size, png: encodePng(size, render(size)) }));
fs.writeFileSync(path.join(assetDir, 'app.ico'), encodeIco(images));
fs.writeFileSync(path.join(assetDir, 'app.png'), images[images.length - 1].png);
fs.writeFileSync(path.join(assetDir, 'logo.png'), images[images.length - 1].png);
