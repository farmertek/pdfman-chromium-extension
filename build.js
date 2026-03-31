/**
 * Build script: copy library files from node_modules to lib/ and generate icons
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ====== Create directories ======
['lib', 'icons'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ====== Copy library files ======
function copyFirst(candidates, dest) {
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied: ${src} -> ${dest}`);
      return true;
    }
  }
  console.error(`  ERROR: None found for ${dest}: ${candidates.join(', ')}`);
  return false;
}

function copyOptional(candidates, dest) {
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied: ${src} -> ${dest}`);
      return true;
    }
  }
  console.log(`  Skipped optional file for ${dest}`);
  return false;
}

function copyIfMissing(candidates, dest) {
  if (fs.existsSync(dest)) {
    console.log(`  Kept existing: ${dest}`);
    return true;
  }
  return copyFirst(candidates, dest);
}

console.log('Copying library files...');
copyFirst([
  'node_modules/pdf-lib/dist/pdf-lib.min.js',
  'node_modules/pdf-lib/dist/pdf-lib.js',
], 'lib/pdf-lib.min.js');

copyFirst([
  'node_modules/pdfjs-dist/build/pdf.min.js',
  'node_modules/pdfjs-dist/build/pdf.js',
  'node_modules/pdfjs-dist/legacy/build/pdf.js',
], 'lib/pdf.js');

copyFirst([
  'node_modules/pdfjs-dist/build/pdf.worker.min.js',
  'node_modules/pdfjs-dist/build/pdf.worker.js',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.js',
], 'lib/pdf.worker.js');

// ====== Copy QPDF files ======
console.log('Copying QPDF files...');
const qpdfDir = path.join('lib', 'qpdf');
const qpdfLibDir = path.join('lib', 'qpdf', 'lib');
[qpdfDir, qpdfLibDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

copyIfMissing([
  'node_modules/qpdf.js/src/qpdf.js',
], path.join(qpdfDir, 'qpdf.js'));

copyIfMissing([
  'node_modules/qpdf.js/src/qpdf-worker.js',
], path.join(qpdfDir, 'qpdf-worker.js'));

copyFirst([
  'node_modules/qpdf.js/src/qpdf-lib.js',
  'node_modules/qpdf.js/src/lib/qpdf.js',
], path.join(qpdfLibDir, 'qpdf.js'));

copyOptional([
  'node_modules/qpdf.js/src/lib/qpdf.wasm',
], path.join(qpdfLibDir, 'qpdf.wasm'));

// ====== Generate PNG icons ======
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const lenB = Buffer.alloc(4);
  lenB.writeUInt32BE(data.length);
  const body = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(body));
  return Buffer.concat([lenB, body, crcB]);
}

function createPdfIconPng(size) {
  const rowBytes = 1 + size * 3; // filter byte + RGB
  const raw = Buffer.alloc(rowBytes * size);
  const margin = Math.max(1, Math.floor(size * 0.12));
  const foldSize = Math.max(2, Math.floor(size * 0.22));
  const barTop = Math.floor(size * 0.50);
  const barBot = Math.floor(size * 0.65);

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 3;
      let r = 238, g = 238, b = 238; // background

      const inDoc = x >= margin && x < size - margin && y >= margin && y < size - margin;
      if (inDoc) {
        r = 255; g = 255; b = 255; // document body
        // Fold corner (top-right)
        const foldX = size - margin - foldSize;
        const foldY = margin + foldSize;
        if (x >= foldX && y < foldY) {
          const dx = x - foldX;
          const dy = y - margin;
          if (dx + dy >= foldSize) {
            r = 200; g = 200; b = 200; // fold shadow
          }
        }
        // Red accent bar
        if (y >= barTop && y < barBot) {
          r = 220; g = 50; b = 47;
        }
        // Border
        if (x === margin || x === size - margin - 1 || y === margin || y === size - margin - 1) {
          r = 100; g = 100; b = 100;
        }
      }
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

console.log('Ensuring icons...');
[16, 48, 128].forEach(size => {
  const iconPath = `icons/icon${size}.png`;
  if (fs.existsSync(iconPath)) {
    console.log(`  Kept existing: ${iconPath}`);
    return;
  }
  const png = createPdfIconPng(size);
  fs.writeFileSync(iconPath, png);
  console.log(`  Created: ${iconPath} (${png.length} bytes)`);
});

console.log('\nBuild complete! Extension is ready to load in Chrome.');
console.log('Go to chrome://extensions -> Load unpacked -> select this folder.');
