import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Make a solid-background PNG with three concentric rings (bronze, silver, gold).
 * Pure pixel math, no third-party deps.
 */
function makeIcon(size, opts = {}) {
  const bg = opts.bg ?? [11, 11, 12];
  const ringColors = [
    [184, 115, 51],   // bronze
    [192, 192, 192],  // silver
    [212, 175, 55],   // gold
  ];
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.42;
  const ringWidth = size * 0.07;
  const goldRadius = size * 0.18;

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      let color = bg;
      if (r <= goldRadius) {
        color = ringColors[2];
      } else {
        for (let i = 0; i < 2; i++) {
          const ringR = outer - i * (ringWidth + size * 0.04);
          if (r <= ringR && r >= ringR - ringWidth) {
            color = ringColors[i];
            break;
          }
        }
      }
      const idx = (y * size + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const filtered = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    filtered[y * (size * 4 + 1)] = 0;
    pixels.copy(filtered, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const idat = deflateSync(filtered, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', iend),
  ]);
}

const tasks = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-512-maskable.png', size: 512 },
];
for (const task of tasks) {
  const buf = makeIcon(task.size);
  writeFileSync(resolve(outDir, task.name), buf);
  console.log(`wrote ${task.name} (${buf.length} bytes)`);
}
