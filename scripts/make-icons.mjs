import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "public");

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function generateDotMatrixPng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // deflate compression
  ihdr[11] = 0; // standard filter
  ihdr[12] = 0; // no interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // 5x7 dot matrix pattern for letter 'S'
  const matrix = [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ];

  const raw = Buffer.alloc(size * (size * 4 + 1));
  const dotR = size * 0.042;
  const dotR2 = dotR * dotR;
  const colSpacing = size * 0.125;
  const rowSpacing = size * 0.105;
  const centerX = size / 2;
  const centerY = size / 2;

  const dots = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (matrix[r][c]) {
        const x = centerX + (c - 2) * colSpacing;
        const y = centerY + (r - 3) * rowSpacing;
        dots.push([x, y]);
      }
    }
  }

  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // Filter: None
    for (let x = 0; x < size; x++) {
      let inside = false;
      for (const [dx, dy] of dots) {
        const dist2 = (x - dx) * (x - dx) + (y - dy) * (y - dy);
        if (dist2 <= dotR2) {
          inside = true;
          break;
        }
      }

      if (inside) {
        raw[offset++] = 255;
        raw[offset++] = 255;
        raw[offset++] = 255;
        raw[offset++] = 255;
      } else {
        // Monochrome Nothing OS background #0a0a0a
        raw[offset++] = 10;
        raw[offset++] = 10;
        raw[offset++] = 10;
        raw[offset++] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

export function writeIcons() {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const p192 = generateDotMatrixPng(192);
  const p512 = generateDotMatrixPng(512);

  fs.writeFileSync(path.join(publicDir, "icon-192.png"), p192);
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), p512);
  console.log("Successfully generated public/icon-192.png and public/icon-512.png");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeIcons();
}
