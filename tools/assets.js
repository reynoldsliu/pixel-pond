// npm run assets           → 掃描 assets/，把符合命名規則的圖寫進 assets/manifest.json（瀏覽器不能列資料夾）
// npm run assets:builtin   → 把程式素材庫輸出成 PNG 到 assets/library/builtin/（當範本或拿去 Aseprite 改）
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PALETTES, parseAssetName, LIB, hex, rng } from '../src/index.js';

const DIR = path.join(import.meta.dirname, '..', 'assets');

function png(w, h, rgba) {
  const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (t, d) => {
    const td = Buffer.concat([Buffer.from(t), d]), l = Buffer.alloc(4), c = Buffer.alloc(4);
    l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[2] === 'builtin') {
  const out = path.join(DIR, 'library', 'builtin'), C = {};
  for (const k in PALETTES.forest) C[k] = hex(PALETTES.forest[k]);
  fs.mkdirSync(out, { recursive: true });
  let n = 0;
  for (const [name, gen] of Object.entries(LIB)) for (let v = 1; v <= 3; v++) {
    const s = gen(C, rng(v * 101), 1);
    fs.writeFileSync(path.join(out, `${name}-${v}.png`), png(s.w, s.h, s.px)); n++;
  }
  console.log(`exported ${n} sprites to assets/library/builtin/`);
} else {
  // 含子資料夾，但 library/ 是素材庫（Kenney、內建範本），不自動載入；想用就複製到 assets/ 其他地方
  const files = fs.readdirSync(DIR, { recursive: true }).map(f => f.split(path.sep).join('/'))
    .filter(f => /\.(png|webp|gif)$/i.test(f) && !f.startsWith('library/')).sort();
  const ok = files.filter(f => parseAssetName(f));
  for (const f of files) if (!ok.includes(f)) console.warn(`skip ${f}: 檔名要是 <flora|rock|prop|terrain>-<back|ground|shore|water|feature>-<名字>.png（小寫、數字、-）`);
  fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify({ files: ok }, null, 2) + '\n');
  console.log(`manifest.json: ${ok.length} files`);
}
