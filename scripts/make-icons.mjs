/**
 * Icon generator — writes the PNG launcher icons with zero dependencies.
 *
 * Node ships zlib, and a PNG is only a header + one zlib stream + a CRC per
 * chunk, so the icons can be produced from vector-ish maths at build time
 * instead of shipping binary art in the repository. Run with:
 *
 *   node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Draw the station sigil: // inside a ring, on a deep-space gradient. */
function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [4, 6, 15];
  const cyan = [92, 225, 230];
  const violet = [167, 139, 250];
  const gold = [255, 212, 121];
  const cx = size / 2;
  const cy = size / 2;
  const safe = maskable ? 0.72 : 1;
  const ringRadius = size * 0.29 * safe;
  const innerRadius = size * 0.2 * safe;
  const barW = size * 0.075 * safe;
  const barL = size * 0.05;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // background: radial glow from the upper left
      const d = Math.hypot(x - size * 0.3, y - size * 0.2) / (size * 0.95);
      let color = mix([11, 20, 48], bg, clamp01(d));
      // ring
      const dr = Math.abs(Math.hypot(x - cx, y - cy) - ringRadius);
      if (dr < size * 0.016) {
        const t = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI);
        const dash = ((t * 24) % 2) < 1.35 ? 1 : 0;
        if (dash) color = mix(color, mix(cyan, violet, t), 0.92);
      }
      // inner ring
      const dir = Math.abs(Math.hypot(x - cx, y - cy) - innerRadius);
      if (dir < size * 0.009) color = mix(color, [27, 39, 69], 0.9);
      // the two slashes // — one cyan, one violet
      const barTop = cy - size * 0.14 * safe;
      const barBottom = cy + size * 0.14 * safe;
      const inVertical = y > barTop && y < barBottom;
      if (inVertical) {
        const firstX = cx - size * 0.1 * safe;
        const secondX = cx + size * 0.04 * safe;
        if (Math.abs(x - firstX) < barW * 0.5) color = mix(color, cyan, 0.95);
        if (Math.abs(x - secondX) < barW * 0.5) color = mix(color, violet, 0.95);
        // diagonal connectors
        const diagShift = (y - barTop) / (barBottom - barTop) * size * 0.06 * safe;
        if (Math.abs(x - (firstX + diagShift)) < barW * 0.5) color = mix(color, cyan, 0.95);
        if (Math.abs(x - (secondX + diagShift)) < barW * 0.5) color = mix(color, violet, 0.95);
      }
      // core dot
      const core = Math.hypot(x - cx, y - cy);
      if (core < size * 0.035 * safe) color = mix(color, gold, 0.95);
      // a soft horizontal scan line for character
      if (Math.abs(y - cy) < 1.2 && core > ringRadius) color = mix(color, [27, 39, 69], 0.8);
      rgba[i] = Math.round(color[0]);
      rgba[i + 1] = Math.round(color[1]);
      rgba[i + 2] = Math.round(color[2]);
      rgba[i + 3] = 255;
    }
  }
  void barL;
  return rgba;
}

function writeIcon(name, size, opts) {
  const data = renderIcon(size, opts);
  const png = encodePNG(size, size, data);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), png);
  return png.length;
}

const outputs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }]
];

let total = 0;
for (const [name, size, opts] of outputs) {
  const bytes = writeIcon(name, size, opts);
  total += bytes;
  console.log(`[neurovoid] wrote icons/${name} (${size}×${size}, ${(bytes / 1024).toFixed(1)} kB)`);
}
console.log(`[neurovoid] generated ${outputs.length} icons, ${(total / 1024).toFixed(1)} kB total, no dependencies.`);
