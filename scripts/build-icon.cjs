const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const LOGO_SIZE = 512;
const SOURCE = path.join(__dirname, '..', 'assets', 'logo-source.png');
const ASSET_DIR = path.join(__dirname, '..', 'assets');
const ICON_PADDING = 0.04;

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

function encodePng(image) {
  const { width, height, data } = image;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Decodes the PNG source to RGBA. Only 8-bit, non-interlaced files are
// produced by design tools; anything else is reported instead of guessed at.
function decodePng(file) {
  const buffer = fs.readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 8 || signature.some((byte, index) => buffer[index] !== byte)) {
    throw new Error(`${file} is not a PNG file.`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height) throw new Error(`${file} has no image header.`);
  if (bitDepth !== 8) throw new Error(`${file} must be an 8-bit PNG (found ${bitDepth}-bit).`);
  if (interlace !== 0) throw new Error(`${file} must not be interlaced.`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${file} uses an unsupported colour type (${colorType}).`);
  if (colorType === 3 && !palette) throw new Error(`${file} is missing its palette.`);

  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(stride * height);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[cursor];
      cursor += 1;
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y > 0 ? pixels[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[row - stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) predictor = paeth(a, b, c);
      else if (filter !== 0) throw new Error(`${file} uses unknown row filter ${filter}.`);
      pixels[row + x] = (value + predictor) & 0xFF;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const source = i * channels;
    const target = i * 4;
    if (colorType === 6) {
      data[target] = pixels[source];
      data[target + 1] = pixels[source + 1];
      data[target + 2] = pixels[source + 2];
      data[target + 3] = pixels[source + 3];
    } else if (colorType === 2) {
      data[target] = pixels[source];
      data[target + 1] = pixels[source + 1];
      data[target + 2] = pixels[source + 2];
      data[target + 3] = 255;
    } else if (colorType === 0 || colorType === 4) {
      data[target] = pixels[source];
      data[target + 1] = pixels[source];
      data[target + 2] = pixels[source];
      data[target + 3] = colorType === 4 ? pixels[source + 1] : 255;
    } else {
      const index = pixels[source];
      data[target] = palette[index * 3] ?? 0;
      data[target + 1] = palette[index * 3 + 1] ?? 0;
      data[target + 2] = palette[index * 3 + 2] ?? 0;
      data[target + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  return { width, height, data };
}

// The artwork is a circular emblem on white, so the margin is trimmed before
// it becomes an icon; otherwise the bus would shrink to a speck at 16 px.
function contentBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] < 16) continue;
      if (image.data[i] > 238 && image.data[i + 1] > 238 && image.data[i + 2] > 238) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: image.width, height: image.height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function squareCrop(image, bounds, padding) {
  const side = Math.max(bounds.width, bounds.height);
  const size = Math.round(side * (1 + padding * 2));
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const left = Math.round(centerX - size / 2);
  const top = Math.round(centerY - size / 2);
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const target = (y * size + x) * 4;
      const sx = left + x;
      const sy = top + y;
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) {
        data[target] = 255;
        data[target + 1] = 255;
        data[target + 2] = 255;
        data[target + 3] = 255;
        continue;
      }
      const source = (sy * image.width + sx) * 4;
      image.data.copy(data, target, source, source + 4);
    }
  }
  return { width: size, height: size, data };
}

function areaWeights(sourceSize, targetSize) {
  const scale = sourceSize / targetSize;
  const groups = [];
  for (let i = 0; i < targetSize; i += 1) {
    const start = i * scale;
    const end = (i + 1) * scale;
    const group = [];
    for (let pixel = Math.floor(start); pixel < Math.ceil(end); pixel += 1) {
      const weight = Math.min(end, pixel + 1) - Math.max(start, pixel);
      if (weight > 0) group.push([pixel, weight]);
    }
    groups.push(group);
  }
  return groups;
}

function resize(image, size) {
  const xWeights = areaWeights(image.width, size);
  const yWeights = areaWeights(image.height, size);
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let total = 0;
      for (const [sy, wy] of yWeights[y]) {
        for (const [sx, wx] of xWeights[x]) {
          const weight = wy * wx;
          const source = (sy * image.width + sx) * 4;
          const a = image.data[source + 3];
          red += image.data[source] * a * weight;
          green += image.data[source + 1] * a * weight;
          blue += image.data[source + 2] * a * weight;
          alpha += a * weight;
          total += weight;
        }
      }
      const target = (y * size + x) * 4;
      if (alpha > 0) {
        data[target] = Math.round(red / alpha);
        data[target + 1] = Math.round(green / alpha);
        data[target + 2] = Math.round(blue / alpha);
      }
      data[target + 3] = Math.round(alpha / total);
    }
  }
  return { width: size, height: size, data };
}

// Windows shows the icon on dark taskbars, so the white corners outside the
// circular emblem are removed instead of shipped as a white square.
function roundCorners(image) {
  const size = image.width;
  const radius = (size / 2) / (1 + ICON_PADDING * 2);
  const feather = Math.max(1, size * 0.008);
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const cover = Math.max(0, Math.min(1, (radius - distance) / feather + 0.5));
      const target = (y * size + x) * 4;
      image.data[target + 3] = Math.round(image.data[target + 3] * cover);
    }
  }
  return image;
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

if (!fs.existsSync(SOURCE)) {
  throw new Error(`Missing ${SOURCE}. Put the association logo there before building icons.`);
}

const source = decodePng(SOURCE);
const bounds = contentBounds(source);
const emblem = squareCrop(source, bounds, ICON_PADDING);
const icons = SIZES.map((size) => ({ size, png: encodePng(roundCorners(resize(emblem, size))) }));

fs.mkdirSync(ASSET_DIR, { recursive: true });
fs.writeFileSync(path.join(ASSET_DIR, 'app.ico'), encodeIco(icons));
fs.writeFileSync(path.join(ASSET_DIR, 'app.png'), icons[icons.length - 1].png);
// The in-app logo keeps the full artwork and its own white margin; the CSS
// clips it to a circle, and the PDF header draws it on white paper.
fs.writeFileSync(path.join(ASSET_DIR, 'logo.png'), encodePng(resize(source, LOGO_SIZE)));
