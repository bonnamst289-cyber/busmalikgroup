const fs = require('node:fs');
const path = require('node:path');

const size = 256;
const xorBytes = size * size * 4;
const maskBytes = size * Math.ceil(size / 32) * 4;
const imageBytes = 40 + xorBytes + maskBytes;
const output = Buffer.alloc(22 + imageBytes);
output.writeUInt16LE(0, 0);
output.writeUInt16LE(1, 2);
output.writeUInt16LE(1, 4);
output.writeUInt8(size === 256 ? 0 : size, 6);
output.writeUInt8(size === 256 ? 0 : size, 7);
output.writeUInt8(0, 8);
output.writeUInt8(0, 9);
output.writeUInt16LE(1, 10);
output.writeUInt16LE(32, 12);
output.writeUInt32LE(imageBytes, 14);
output.writeUInt32LE(22, 18);

const dib = 22;
output.writeUInt32LE(40, dib);
output.writeInt32LE(size, dib + 4);
output.writeInt32LE(size * 2, dib + 8);
output.writeUInt16LE(1, dib + 12);
output.writeUInt16LE(32, dib + 14);
output.writeUInt32LE(0, dib + 16);
output.writeUInt32LE(xorBytes, dib + 20);

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const offset = dib + 40 + ((size - 1 - y) * size + x) * 4;
    const isBus = y >= 92 && y <= 180 && x >= 40 && x <= 216;
    const isWindow = y >= 108 && y <= 140 && ((x >= 62 && x <= 116) || (x >= 128 && x <= 190));
    const isWheel = y >= 168 && y <= 204 && (x >= 64 && x <= 100 || x >= 164 && x <= 200);
    const color = isWheel ? [26, 42, 63] : isWindow ? [190, 223, 255] : isBus ? [255, 255, 255] : [37, 103, 199];
    output[offset] = color[2];
    output[offset + 1] = color[1];
    output[offset + 2] = color[0];
    output[offset + 3] = 255;
  }
}

const assetDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetDir, { recursive: true });
fs.writeFileSync(path.join(assetDir, 'app.ico'), output);
