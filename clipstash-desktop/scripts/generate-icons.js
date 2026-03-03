#!/usr/bin/env node
// Generate desktop icons from Chrome extension source icon.
// Reads the 128x128 source PNG and produces all required sizes
// using nearest-neighbor scaling (no external dependencies).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC_ICON = path.join(__dirname, '..', '..', 'clipstash-ext', 'icons', 'icon128.png');
const SRC_MACOS_ICON = path.join(__dirname, '..', '..', 'clipstash-ext', 'icons', 'icon-macos-1024.png');
const ICONS_DIR = path.join(__dirname, '..', 'src-tauri', 'icons');

fs.mkdirSync(ICONS_DIR, { recursive: true });

// ===== Minimal PNG decoder (for 8-bit RGBA PNGs) =====

function parsePNG(buf) {
  // Validate PNG signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error('Not a valid PNG');
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];
  let pos = 8;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    pos += 12 + len; // 4(len) + 4(type) + len + 4(crc)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  // Determine bytes per pixel
  let bpp;
  switch (colorType) {
    case 2: bpp = 3; break; // RGB
    case 6: bpp = 4; break; // RGBA
    default: throw new Error(`Unsupported PNG color type: ${colorType}`);
  }

  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);

  // Reconstruct with PNG filter (Sub, Up, Average, Paeth)
  const prev = new Uint8Array(stride);
  const curr = new Uint8Array(stride);

  function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawPos++];
    for (let i = 0; i < stride; i++) {
      curr[i] = raw[rawPos++];
    }

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? curr[i - bpp] : 0; // not yet reconstructed for Sub
      // We need to reconstruct in-place
    }

    // Re-read and reconstruct properly
    rawPos -= stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[rawPos + i];
      const a = i >= bpp ? curr[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;

      switch (filterType) {
        case 0: curr[i] = x; break;
        case 1: curr[i] = (x + a) & 0xFF; break;
        case 2: curr[i] = (x + b) & 0xFF; break;
        case 3: curr[i] = (x + Math.floor((a + b) / 2)) & 0xFF; break;
        case 4: curr[i] = (x + paethPredictor(a, b, c)) & 0xFF; break;
        default: curr[i] = x;
      }
    }
    rawPos += stride;

    // Copy to RGBA output
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (bpp === 4) {
        rgba[dstIdx] = curr[x * 4];
        rgba[dstIdx + 1] = curr[x * 4 + 1];
        rgba[dstIdx + 2] = curr[x * 4 + 2];
        rgba[dstIdx + 3] = curr[x * 4 + 3];
      } else {
        rgba[dstIdx] = curr[x * 3];
        rgba[dstIdx + 1] = curr[x * 3 + 1];
        rgba[dstIdx + 2] = curr[x * 3 + 2];
        rgba[dstIdx + 3] = 255;
      }
    }

    // Save current row as previous
    prev.set(curr);
  }

  return { width, height, rgba };
}

// ===== Bilinear resize =====

function resizeRGBA(srcRgba, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const srcY = y * yRatio;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const xFrac = srcX - x0;
      const yFrac = srcY - y0;

      const dstIdx = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = srcRgba[(y0 * srcW + x0) * 4 + c];
        const v10 = srcRgba[(y0 * srcW + x1) * 4 + c];
        const v01 = srcRgba[(y1 * srcW + x0) * 4 + c];
        const v11 = srcRgba[(y1 * srcW + x1) * 4 + c];
        const top = v00 * (1 - xFrac) + v10 * xFrac;
        const bottom = v01 * (1 - xFrac) + v11 * xFrac;
        dst[dstIdx + c] = Math.round(top * (1 - yFrac) + bottom * yFrac);
      }
    }
  }
  return dst;
}

// ===== PNG encoder =====

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, rgba) {
  const chunks = [];
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  function writeChunk(type, data) {
    const typeStr = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const combined = Buffer.concat([typeStr, data]);
    const crcVal = Buffer.alloc(4);
    crcVal.writeUInt32BE(crc32(combined), 0);
    chunks.push(len, typeStr, data, crcVal);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeChunk('IHDR', ihdr);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgba[srcIdx];
      rawData[dstIdx + 1] = rgba[srcIdx + 1];
      rawData[dstIdx + 2] = rgba[srcIdx + 2];
      rawData[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }
  writeChunk('IDAT', zlib.deflateSync(rawData, { level: 9 }));
  writeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat(chunks);
}

function createICO(png32Path) {
  const pngData = fs.readFileSync(png32Path);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = 32; dirEntry[1] = 32; dirEntry[2] = 0; dirEntry[3] = 0;
  dirEntry.writeUInt16LE(1, 4);
  dirEntry.writeUInt16LE(32, 6);
  dirEntry.writeUInt32LE(pngData.length, 8);
  dirEntry.writeUInt32LE(22, 12);
  return Buffer.concat([header, dirEntry, pngData]);
}

/**
 * Create ICNS file with multiple icon sizes for Retina support.
 * Accepts a map of { type: pngPath } entries.
 * ICNS types: ic07=128, ic08=256, ic09=512, ic10=1024
 */
function createICNS(entries) {
  const chunks = [];
  let totalSize = 8; // file header
  for (const { type, pngPath } of entries) {
    const pngData = fs.readFileSync(pngPath);
    const typeTag = Buffer.from(type, 'ascii');
    const sizeTag = Buffer.alloc(4);
    sizeTag.writeUInt32BE(8 + pngData.length, 0);
    chunks.push(typeTag, sizeTag, pngData);
    totalSize += 8 + pngData.length;
  }
  const fileHeader = Buffer.from('icns', 'ascii');
  const fileSize = Buffer.alloc(4);
  fileSize.writeUInt32BE(totalSize, 0);
  return Buffer.concat([fileHeader, fileSize, ...chunks]);
}

// ===== Main =====

if (!fs.existsSync(SRC_ICON)) {
  console.error(`Source icon not found: ${SRC_ICON}`);
  console.error('Falling back to placeholder generation...');
  process.exit(1);
}

console.log(`Reading source icon: ${SRC_ICON}`);
const srcBuf = fs.readFileSync(SRC_ICON);
const src = parsePNG(srcBuf);
console.log(`Source: ${src.width}x${src.height}`);

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

for (const { name, size } of sizes) {
  let rgba;
  if (size === src.width && size === src.height) {
    rgba = src.rgba;
  } else {
    rgba = resizeRGBA(src.rgba, src.width, src.height, size, size);
  }
  const png = createPNG(size, size, rgba);
  const outPath = path.join(ICONS_DIR, name);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${name} (${size}x${size}, ${png.length} bytes)`);
}

const icoData = createICO(path.join(ICONS_DIR, '32x32.png'));
fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), icoData);
console.log('Generated icon.ico');

// === macOS flat-style icon for .icns (multi-size for Retina) ===
if (fs.existsSync(SRC_MACOS_ICON)) {
  console.log(`\nReading macOS source icon: ${SRC_MACOS_ICON}`);
  const macBuf = fs.readFileSync(SRC_MACOS_ICON);
  const macSrc = parsePNG(macBuf);
  console.log(`macOS source: ${macSrc.width}x${macSrc.height}`);

  // Generate macOS-style PNGs at all needed sizes
  const macosSizes = [
    { name: 'icon-macos-128.png', size: 128, icnsType: 'ic07' },
    { name: 'icon-macos-256.png', size: 256, icnsType: 'ic08' },
    { name: 'icon-macos-512.png', size: 512, icnsType: 'ic09' },
    { name: 'icon-macos-1024.png', size: 1024, icnsType: 'ic10' },
  ];
  for (const { name, size } of macosSizes) {
    let rgba;
    if (size === macSrc.width && size === macSrc.height) {
      rgba = macSrc.rgba;
    } else {
      rgba = resizeRGBA(macSrc.rgba, macSrc.width, macSrc.height, size, size);
    }
    const png = createPNG(size, size, rgba);
    fs.writeFileSync(path.join(ICONS_DIR, name), png);
    console.log(`Generated ${name} (${size}x${size}, ${png.length} bytes)`);
  }

  // Build .icns with multiple sizes for crisp Retina rendering
  const icnsEntries = macosSizes.map(({ icnsType, name }) => ({
    type: icnsType,
    pngPath: path.join(ICONS_DIR, name),
  }));
  const icnsData = createICNS(icnsEntries);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.icns'), icnsData);
  console.log(`Generated icon.icns (multi-size, ${icnsData.length} bytes)`);
} else {
  console.log('\nmacOS source icon not found, using standard icon for .icns');
  const icnsData = createICNS([{ type: 'ic07', pngPath: path.join(ICONS_DIR, '128x128.png') }]);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.icns'), icnsData);
  console.log('Generated icon.icns');
}

console.log('\nAll icons generated from source icon!');
