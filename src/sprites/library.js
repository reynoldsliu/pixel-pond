import { WHITE, bayer, hash, lum, mix, shade } from '../core/color.js';

/* 程式繪製的素材庫：花草樹木、石頭、遺跡、遺落工具、火堆。
 * 每個產生器 (C, R, z) → sprite { w, h, px, ax }：最下面一列是地面（根部），ax 是根部所在欄。
 * 顏色跟著使用者配色走；統一左上受光，所以不做左右翻轉。
 * 純函式、不碰 DOM。 */
export function builder() {
  const m = new Map(), key = (x, y) => x + ',' + y;
  return {
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (y <= 0) m.set(key(x, y), [x, y, c]); },
    has: (x, y) => m.has(key(Math.round(x), Math.round(y))),
    outlineColor(c) { // 外框：用一個偏冷的暗色描邊（範例的像素畫都是這種深色而非純黑的外框）
      const edge = [];
      for (const [x, y] of m.values())
        if (!m.has(key(x + 1, y)) || !m.has(key(x - 1, y)) || !m.has(key(x, y - 1)) || (y < 0 && !m.has(key(x, y + 1)))) edge.push([x, y, c]);
      for (const p of edge) m.set(key(p[0], p[1]), p);
    },
    outline(k) { // 形狀邊緣壓暗一階
      const edge = [];
      for (const [x, y, c] of m.values())
        if (!m.has(key(x + 1, y)) || !m.has(key(x - 1, y)) || !m.has(key(x, y - 1)) || !m.has(key(x, y + 1))) edge.push([x, y, shade(c, k)]);
      for (const p of edge) m.set(key(p[0], p[1]), p);
    },
    done(extra) {
      let x1 = 1e9, x2 = -1e9, y1 = 1e9;
      for (const [x, y] of m.values()) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; }
      const w = x2 - x1 + 1, h = 1 - y1, px = new Uint8ClampedArray(w * h * 4);
      for (const [x, y, c] of m.values()) {
        const o = ((y - y1) * w + (x - x1)) * 4;
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
      }
      return Object.assign({ w, h, px, ax: -x1 }, extra);
    },
  };
}
export const line = (b, x0, y0, x1, y1, col) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) b.set(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, typeof col === 'function' ? col(k) : col);
};
// 環境亮度：夜晚配色時石頭、木頭也跟著變暗
export const envK = C => Math.min(1.15, Math.max(0.4, lum(C.grass) / 128));
export const stoneOf = C => shade(mix([136, 133, 124], C.dirt, 0.15), envK(C));
export const metalOf = C => shade([162, 166, 172], envK(C));
export const woodOf = C => mix(C.trunk, [200, 150, 90], 0.25);

// 一種材質的 5 階色：暗部偏冷（藍綠）、亮部偏暖（黃），和範例一樣做色相偏移，而不是單純調亮調暗
export function tones(base) {
  return {
    out: mix(shade(base, 0.3), [12, 20, 28], 0.45),
    dark: mix(shade(base, 0.6), [18, 40, 58], 0.3),
    mid: base,
    light: mix(base, [232, 232, 130], 0.22),
    hi: mix(base, [250, 248, 190], 0.45),
  };
}
// 寫實葉叢用的 7 階色：最暗偏藍綠（樹冠深處）→ 最亮偏暖黃（向陽的葉尖）
export function ramp7(base) {
  const deep = mix(shade(base, 0.3), [8, 28, 40], 0.45), hi = mix(base, [236, 236, 150], 0.5);
  return [deep, mix(deep, base, 0.4), mix(deep, base, 0.72), base, mix(base, hi, 0.35), mix(base, hi, 0.7), hi];
}
// 寫實樹冠：沒有外框。每個像素的亮度 = 整個樹冠的大形體受光 + 所屬葉叢的小形體受光 + 2×2 葉簇雜訊 − 下半部的環境遮蔽，
// 再量化成 7 階；邊緣用雜訊打散成零碎葉片，內部留幾個透光小洞（看得到後面的枝幹）
export function canopy(b, list, base, z, seed) {
  const P = ramp7(base), cell = new Map(), sh = 1, big = z > 1.2 ? 1 : 0;
  let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
  list.sort((a, c) => a[1] - c[1]).forEach(([cx, cy, r], k) => {
    for (let y = Math.floor(cy - r * 1.3); y <= Math.ceil(cy + r * 1.3); y++) for (let x = Math.floor(cx - r * 1.3); x <= Math.ceil(cx + r * 1.3); x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, d = Math.hypot(nx, ny);
      const inside = d < 1 + (hash(x >> sh, y >> sh, seed + k) - 0.5) * 0.45;
      if (!inside && !(d < 1.3 && hash(x, y, seed + k + 50) < 0.12)) continue; // 邊緣零星的葉片
      cell.set(x + ',' + y, [x, y, nx, ny, 1 - d]);
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
  });
  const gx0 = (x1 + x2) / 2, gy0 = (y1 + y2) / 2, RX = (x2 - x1) / 2 + 1, RY = (y2 - y1) / 2 + 1;
  for (const [x, y, nx, ny, dIn] of cell.values()) {
    if (dIn > 0.35 && hash(x >> sh, y >> sh, seed + 9) < 0.035) continue; // 透光小洞
    const gx = (x - gx0) / RX, gy = (y - gy0) / RY;
    const l = -(gx * 0.55 + gy * 0.85) * 0.55 - (nx * 0.5 + ny * 0.85) * 0.45
      + (hash(x >> 1, y >> 1, seed + 7) - 0.5) * (big ? 0.4 : 0.6) + big * (hash((x + 1) >> 2, (y + 2) >> 2, seed + 6) - 0.5) * 0.45 // 2 px 葉簇 + 大樹再疊 4 px 的葉團
      + (hash(x, y, seed + 8) - 0.5) * 0.25 - Math.max(0, gy) * 0.35;
    b.set(x, y, P[Math.max(0, Math.min(6, Math.round(3 + l * 3)))]);
  }
  return P;
}
// 一團團小球組成的葉叢：每團各自左上受光，後畫的（較下方、較前面）蓋住先畫的，團與團之間自然出現暗縫
export function clumps(b, list, base) {
  const T = tones(base);
  list.sort((a, c) => a[1] - c[1]);
  for (const [cx, cy, r] of list)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
      if (nx * nx + ny * ny > 1) continue;
      const l = -(nx * 0.65 + ny) + (bayer(x, y) - 0.5) * 0.45;
      b.set(x, y, l > 0.95 && hash(x, y, 2) < 0.6 ? T.hi : l > 0.3 ? T.light : l > -0.45 ? T.mid : T.dark);
    }
  return T;
}
// 樹枝：從 (x, y) 朝 ang（0 = 正上）長 len，粗 w；每節分 2–3 枝，枝長、角度都隨機，末梢記下來長葉叢
export function limb(segs, tips, R, x, y, ang, len, w, depth) {
  const x1 = x + Math.sin(ang) * len, y1 = y - Math.cos(ang) * len;
  segs.push([x, y, x1, y1, w, Math.max(1, w * 0.65), depth]);
  if (depth <= 0 || len < 2.5) { tips.push([x1, y1]); return; }
  const n = R() < 0.35 ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const a = ang + (k - (n - 1) / 2) * (0.55 + R() * 0.5) + (R() - 0.5) * 0.35;
    limb(segs, tips, R, x1, y1, Math.max(-1.3, Math.min(1.3, a)), len * (0.55 + R() * 0.3), Math.max(1, w * 0.62), depth - 1);
  }
  if (R() < 0.4) tips.push([x1, y1]);
}
// 畫一段有粗細的枝幹：左亮右暗，粗的部分有樹皮紋；outlined 時兩側加深色外框
export function drawSeg(b, T, [x0, y0, x1, y1, w0, w1], uMax = 1, outlined = false) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) || 1, horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  for (let k = 0; k <= n * uMax; k++) {
    const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, w = Math.max(1, Math.round(w0 + (w1 - w0) * u)) + (outlined ? 2 : 0);
    for (let d = 0; d < w; d++) {
      const o = d - (w - 1) / 2, f = w > 1 ? d / (w - 1) : 0.5;
      let c = outlined && (d === 0 || d === w - 1) ? T.out : f < 0.25 ? T.light : f > 0.75 ? T.dark : f > 0.5 ? mix(T.mid, T.dark, 0.5) : T.mid;
      const bark = hash(Math.round(x + o), Math.round(y) >> 1, 5); // 縱向樹皮紋：一段段深色裂縫、偶爾一點亮的樹皮
      if (w >= 3 && bark < 0.16) c = mix(T.dark, T.out, 0.4); else if (w >= 3 && bark > 0.93 && f < 0.6) c = T.hi;
      horiz ? b.set(x, y + o, c) : b.set(x + o, y, c);
    }
  }
}
// 樹根：2–4 條沿地面往兩側爬、越遠越細
export function roots(b, T, R, tw, z) {
  for (let k = 0, n = 2 + ((R() * 3) | 0); k < n; k++) {
    const dir = k % 2 ? 1 : -1, len = Math.max(1, Math.round((1.5 + R() * 3) * Math.max(0.5, z))), x0 = Math.round(dir * (tw / 2 + 0.5));
    for (let j = 0; j <= len; j++) {
      b.set(x0 + dir * j, 0, j === len ? T.dark : dir < 0 && j < len / 2 ? T.mid : T.dark);
      if (j < len * 0.45) b.set(x0 + dir * j, -1, j === 0 ? T.mid : dir < 0 ? T.light : T.mid);
    }
  }
}

// 闊葉樹：樹幹（帶彎、會斜）→ 隨機分枝 2–3 層 → 每個枝梢長一團葉叢；下半段的主枝畫在葉叢上，看得到樹的骨架
export function genOak(C, R, z) {
  const b = builder(), T = tones(C.trunk);
  const tw = Math.max(2, Math.round((1.8 + R() * 1.4) * z)), th = (7 + R() * 7) * z, lean = (R() - 0.5) * 0.4;
  const depth = z < 0.5 ? 1 : z < 1.1 ? 2 : 3, segs = [], tips = [];
  const mx = Math.sin(lean) * th * 0.5 + (R() - 0.5) * 1.5 * z, bend = [0, 0, mx, -th * 0.55, tw, tw * 0.9, 9];
  segs.push(bend);
  limb(segs, tips, R, mx, -th * 0.55, lean * 0.6, th * (0.5 + R() * 0.3) + 3 * z, tw * 0.9, depth);
  for (const sg of segs) drawSeg(b, T, sg);
  const list = [], rr = Math.max(1.8, (3.2 + R() * 1.8) * Math.max(0.55, z));
  for (const [x, y] of tips) {
    list.push([x, y, rr * (0.8 + R() * 0.45)]);
    if (R() < 0.6) list.push([x + (R() - 0.5) * rr * 1.6, y + (R() - 0.3) * rr, rr * (0.6 + R() * 0.3)]);
  }
  const mxT = tips.reduce((n, t) => n + t[0], 0) / tips.length, myT = tips.reduce((n, t) => n + t[1], 0) / tips.length;
  list.push([mxT, myT + rr * 0.3, rr * (0.9 + R() * 0.4)]); // 中間補一團，不然樹冠中空
  canopy(b, list, mix(C.foliage, [70, 110, 40], (R() - 0.5) * 0.25), z, (R() * 1e4) | 0);
  drawSeg(b, T, bend);
  for (const sg of segs) if (sg[6] === depth && R() < 0.8) drawSeg(b, T, sg, 0.45 + R() * 0.25); // 主枝下半露出來
  roots(b, T, R, tw, z);
  return b.done();
}

// 針葉樹：層數、每層寬度、左右長短、樹身傾斜都隨機，偶爾一側斷枝；下層先畫，上層的裙邊蓋住下層
export function genPine(C, R, z) {
  const b = builder(), base = mix(C.foliage, [30, 70, 75], 0.3 + (R() - 0.5) * 0.2), P = ramp7(base), Tt = tones(C.trunk), seed = (R() * 1e4) | 0;
  const h = Math.round((26 + R() * 18) * z), th = Math.max(2, Math.round((3 + R() * 4) * z)), wmax = (7 + R() * 4) * z, tiers = Math.max(3, Math.round((4 + R() * 4) * Math.min(1.3, Math.max(0.6, z))));
  const lean = (R() - 0.5) * 0.12, tierH = (h - th) / tiers * 1.75, tw = Math.max(1, Math.round(1.6 * z));
  for (let y = -h; y <= 0; y++) b.set(-y * lean, y, Tt.dark); // 樹芯（從枝葉縫隙看得到）
  // 寫實針葉：沒有外框。每層枝葉上亮下暗、向陽側（左）亮，加上一條條下垂的針葉紋；外緣打散，下緣垂下零星針葉
  for (let k = 0; k < tiers; k++) {
    const top = -th - (h - th) * (k + 1) / tiers, w = wmax * (1 - k / tiers) * 0.95 + 1.5;
    const wl = w * (0.8 + R() * 0.35) * (R() < 0.12 ? 0.55 : 1), wr = w * (0.8 + R() * 0.35) * (R() < 0.12 ? 0.55 : 1);
    for (let y = Math.floor(top); y <= Math.min(-th + 1, top + tierH); y++) {
      const f = (y - top) / tierH, sp = Math.pow(Math.max(0, f), 0.75), cx = -y * lean;
      for (let x = Math.floor(cx - wl * sp) - 1; x <= Math.ceil(cx + wr * sp) + 1; x++) {
        const half = x < cx ? wl * sp : wr * sp, e = Math.abs(x - cx) - half;
        if (e > 0.5 || (e > -1.5 && hash(x, y, seed) < 0.4)) continue; // 外緣打散
        const side = (x - cx) / Math.max(1, half), streak = hash(x, (y - x * 0.6) >> 1, seed + 1);
        const l = -side * 0.45 - (f - 0.45) * 1.1 + (streak - 0.5) * 0.7 + (k / tiers) * 0.35 - 0.1;
        b.set(x, y, P[Math.max(0, Math.min(6, Math.round(3 + l * 2.8)))]);
        if (f > 0.85 && hash(x, y, seed + 2) < 0.22) b.set(x, y + 1, P[1]); // 下垂的針葉
      }
    }
  }
  b.set(-(-h - 1) * lean, -h - 1, P[4]); // 樹尖
  drawSeg(b, Tt, [0, 0, th * lean, -th, tw, tw, 9]);
  roots(b, Tt, R, tw, z * 0.8);
  return b.done();
}

// 落葉樹的冬天：同樣的樹幹與分枝，枝梢只剩細枝；下雪的地方枝條上緣積一點雪
export function genBare(C, R, z, snow) {
  const b = builder(), T = tones(C.trunk);
  const tw = Math.max(2, Math.round((1.8 + R() * 1.4) * z)), th = (7 + R() * 7) * z, lean = (R() - 0.5) * 0.4;
  const depth = z < 0.5 ? 2 : z < 1.1 ? 3 : 4, segs = [], tips = [];
  const mx = Math.sin(lean) * th * 0.5 + (R() - 0.5) * 1.5 * z;
  segs.push([0, 0, mx, -th * 0.55, tw, tw * 0.9, 9]);
  limb(segs, tips, R, mx, -th * 0.55, lean * 0.6, th * (0.5 + R() * 0.3) + 3 * z, tw * 0.9, depth);
  for (const sg of segs) drawSeg(b, T, sg);
  for (const [x, y] of tips) for (let k = 0; k < 3; k++) { // 細枝
    const a = (R() - 0.5) * 1.6, len = 1 + R() * 2.5 * Math.max(0.6, z);
    line(b, x, y, x + Math.sin(a) * len, y - Math.cos(a) * len, mix(T.mid, T.light, 0.3));
  }
  if (snow) for (const [x0, y0, x1, y1, w0] of segs) if (w0 >= 1 && Math.abs(x1 - x0) > Math.abs(y1 - y0) * 0.4) line(b, x0, y0 - Math.ceil(w0 / 2), x1, y1 - 1, [236, 242, 246]);
  roots(b, T, R, tw, z);
  return b.done();
}

// 棕櫚：細長略彎的樹幹（一圈圈葉痕），頂端 7–9 片往下垂的羽狀葉，左上受光；椰子樹在葉下掛幾顆果
export function genPalm(C, R, z, fruit) {
  const b = builder(), T = tones(mix(C.trunk, [150, 120, 90], 0.35)), P = ramp7(mix(C.foliage, [70, 130, 50], 0.25));
  const h = (20 + R() * 14) * z, bend = (R() - 0.5) * 0.5 * h, tw = Math.max(1, Math.round(1.6 * z));
  const at = u => [bend * u * u, -h * u];
  for (let k = 0; k <= h; k++) {
    const [x, y] = at(k / h);
    for (let d = 0; d < tw + (k < 3 ? 1 : 0); d++) b.set(x + d - tw / 2, y, k % 3 === 0 ? T.dark : d === 0 ? T.light : T.mid);
  }
  const [hx, hy] = at(1), n = 7 + ((R() * 3) | 0);
  for (let f = 0; f < n; f++) {
    const a = -Math.PI / 2 + (f / (n - 1) - 0.5) * Math.PI * 1.6 + (R() - 0.5) * 0.3, len = (8 + R() * 5) * z;
    for (let k = 0; k <= len; k++) {
      const u = k / len, x = hx + Math.cos(a) * k, y = hy + Math.sin(a) * k * 0.6 + u * u * len * 0.55; // 葉尖下垂
      const l = -Math.cos(a) * 0.4 - u * 0.5 + (y < hy ? 0.4 : 0) + (hash(f, k, 7) - 0.5) * 0.3;
      b.set(x, y, pick7(P, l));
      if (k % 2 === 0 && u > 0.15 && u < 0.9) b.set(x, y + 1, pick7(P, l - 0.5)); // 羽狀小葉
    }
  }
  if (fruit) for (let k = 0; k < 3; k++) b.set(hx - 1 + k, hy + 1 + (k % 2), [150, 110, 50]);
  return b.done();
}

// 仙人掌（團扇屬）：一片片扁圓的莖節往上疊，左亮右暗，上面點著刺座
export function genCactus(C, R, z) {
  const b = builder(), P = ramp7(mix(C.foliage, [90, 130, 70], 0.5));
  const pad = (cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      b.set(x, y, hash(x, y, 9) < 0.08 ? [230, 220, 170] : pick7(P, -(nx * 0.7 + ny * 0.5) * 0.8));
    }
  };
  const rx = 2.4 * z, ry = 3.4 * z, list = [[0, -ry]];
  for (let k = 0; k < 2 + ((R() * 3) | 0); k++) { const p = list[(R() * list.length) | 0]; list.push([p[0] + (R() - 0.5) * rx * 2.6, p[1] - ry * (1.1 + R() * 0.5)]); }
  for (const [x, y] of list) pad(x, y, rx * (0.8 + R() * 0.3), ry * (0.8 + R() * 0.3));
  return b.done();
}

// 沙灘上的貝殼與小石頭
export function genShells(C, R) {
  const b = builder();
  for (let k = 0; k < 2 + ((R() * 3) | 0); k++) {
    const x = Math.round((R() - 0.5) * 8), c = [[240, 226, 210], [226, 180, 160], [200, 190, 180]][(R() * 3) | 0];
    b.set(x, 0, c); b.set(x + 1, 0, shade(c, 0.8)); if (R() < 0.5) b.set(x, -1, mix(c, WHITE, 0.4));
  }
  return b.done();
}

export function genBush(C, R, z) {
  const b = builder(), r = (4.5 + R() * 3) * z, list = [];
  for (let k = 0, n = 4 + ((R() * 3) | 0); k < n; k++) list.push([(R() - 0.5) * r * 1.5, -r * (0.55 + R() * 0.5), r * (0.45 + R() * 0.2)]);
  canopy(b, list, mix(C.foliage, C.grass, 0.35), z, (R() * 1e4) | 0);
  if (R() < 0.35) for (let k = 0; k < 4; k++) b.set((R() - 0.5) * r * 1.4, -r * (0.4 + R() * 0.8), [196, 56, 70]); // 漿果
  return b.done();
}

export const FLOWERS = [[236, 206, 74], [120, 150, 232], [244, 242, 232], [226, 96, 96], [190, 130, 226]];
// 草叢（可帶花）。overhang：岸邊版本往外倒、比較長，像範例那樣垂到水面上
export function genTuft(C, R, z, flowers, overhang) {
  const b = builder(), n = (overhang ? 6 : 4) + ((R() * 4) | 0), T = tones(C.grass);
  const col = FLOWERS[(R() * FLOWERS.length) | 0];
  for (let k = 0; k < n; k++) {
    const x0 = Math.round((k - n / 2) * 1.1), hh = Math.round((overhang ? 4 : 3) + R() * 4 - Math.abs(k - n / 2) * 0.5);
    const lean = (x0 / n) * (overhang ? 5 : 3) + (R() - 0.5);
    for (let j = 0; j <= hh; j++) b.set(x0 + lean * (j / hh) ** 1.5, -j, j < hh * 0.35 ? T.dark : j > hh * 0.75 ? T.light : T.mid);
    if (flowers && R() < 0.55) {
      const fx = Math.round(x0 + lean), fy = -hh - 1;
      b.set(fx, fy, col);
      if (R() < 0.4) { b.set(fx - 1, fy, col); b.set(fx + 1, fy, col); b.set(fx, fy - 1, col); b.set(fx, fy, [250, 226, 110]); }
    }
  }
  return b.done();
}

export function genMushroom(C, R) {
  const b = builder(), cap = R() < 0.7 ? [200, 60, 50] : [190, 140, 90], stem = shade([236, 226, 200], envK(C));
  b.set(0, 0, stem); b.set(0, -1, stem);
  for (let x = -2; x <= 2; x++) b.set(x, -2, x === 2 ? shade(cap, 0.7) : cap);
  for (let x = -1; x <= 1; x++) b.set(x, -3, x === -1 ? mix(cap, WHITE, 0.3) : cap);
  b.set(-1, -2, [245, 240, 230]);
  if (R() < 0.5) { b.set(2, 0, stem); b.set(1, -1, cap); b.set(2, -1, cap); b.set(3, -1, shade(cap, 0.7)); }
  return b.done();
}

// 7 階色裡依亮度 l（約 -1…1）挑一階
export const pick7 = (P, l) => P[Math.max(0, Math.min(6, Math.round(3 + l * 3)))];

// 香蒲叢（寫實）：葉子從根部暗到葉尖亮、每片受光不同，部分葉子在上段折垂；香蒲穗是圓柱（左亮右暗）帶頂端細芯
export function genReeds(C, R, z) {
  const b = builder(), n = 7 + ((R() * 6) | 0), P = ramp7(mix(C.grass, [150, 160, 70], 0.2)), H = ramp7(mix(C.trunk, [120, 70, 42], 0.5));
  const wide = z > 1.3 ? 1 : 0, heads = [];
  for (let k = 0; k < n; k++) {
    const x0 = Math.round((k - n / 2) * 1.1 * Math.max(1, z * 0.8)), hh = Math.max(5, Math.round((11 + R() * 11) * z - Math.abs(k - n / 2) * 1.3));
    const lean = (x0 / n) * 4 + (R() - 0.5) * 2.5, face = (R() - 0.5) * 0.8, fold = R() < 0.3 ? hh * (0.6 + R() * 0.2) : 1e9;
    let px = x0, py = 0;
    for (let j = 0; j <= hh; j++) {
      const f = j / hh, l = (f - 0.45) * 1.2 + face + (hash(k, j, 3) - 0.5) * 0.3;
      if (j > fold) { px += Math.sign(lean || 1) * 0.8; py = -fold + (j - fold) * 0.5; } // 折垂的葉尖往下掉
      else { px = x0 + lean * f ** 2; py = -j; }
      b.set(px, py, pick7(P, j > fold ? l - 0.4 : l));
      if (wide && f < 0.7) b.set(px + 1, py, pick7(P, l - 0.5));
    }
    if (R() < 0.45 && hh > 10 && fold > hh) heads.push([x0 + lean * 0.85, -Math.round(hh * 0.72), Math.max(3, Math.round(4.5 * z))]);
  }
  for (const [hx, hy, len] of heads) {
    for (let j = 0; j < len; j++) for (let c = 0; c <= 1 + wide; c++) b.set(hx + c, hy - j, pick7(H, (c === 0 ? 0.35 : c === 1 ? -0.15 : -0.5) + (j === 0 ? -0.3 : j === len - 1 ? 0.2 : 0)));
    b.set(hx, hy - len, pick7(P, -0.2)); b.set(hx, hy - len - 1, pick7(P, 0)); // 穗頂細芯
  }
  return b.done();
}

// 石頭：偏藍灰的石身，頂上蓋一片青苔（範例裡的大石頭幾乎都長滿苔）
export function stoneBlob(b, ox, rx, ry, C, R, mossy) {
  const S = tones(mix(stoneOf(C), [92, 106, 122], 0.35)), M = tones(mix(C.grass, [90, 130, 60], 0.2));
  const ph = R() * 7, cy = 0.5 - ry * 0.6, mossLine = -0.15 + R() * 0.25;
  for (let y = Math.floor(cy - ry * 1.3); y <= 0; y++) for (let x = Math.floor(-rx * 1.3); x <= Math.ceil(rx * 1.3); x++) {
    const nx = (x + 0.5) / rx, ny = (y + 0.5 - cy) / ry, a = Math.atan2(ny, nx);
    if (nx * nx + ny * ny > 1 + 0.12 * Math.sin(3 * a + ph)) continue;
    const l = -(nx * 0.7 + ny) + (bayer(x, y) - 0.5) * 0.4;
    const P = mossy && ny + 0.25 * Math.sin(nx * 5 + ph) < mossLine ? M : S;
    b.set(ox + x, y, l > 0.85 ? P.hi : l > 0.25 ? P.light : l > -0.4 ? P.mid : P.dark);
  }
}
export function genRock(C, R, z, size, mossy) {
  const b = builder(), rx = (size + R() * size * 0.6) * z;
  stoneBlob(b, 0, rx, rx * (0.6 + R() * 0.2), C, R, mossy ?? R() < 0.6);
  b.outline(0.8); // 不描深色外框，只把邊緣壓暗一點，和寫實的樹一致
  return b.done();
}
export function genPebbles(C, R) {
  const b = builder();
  for (let k = 0, x = 0; k < 2 + ((R() * 2) | 0); k++, x += 4 + ((R() * 2) | 0)) stoneBlob(b, x, 1.8 + R() * 0.8, 1.6 + R() * 0.6, C, R, false);
  b.outline(0.7);
  return b.done();
}

// ---- 地標（寫實）：沒有外框，用材質的 7 階色做形體明暗、接縫斜面、裂縫、青苔與鏽斑 ----
export const mossAt = (x, y, z, k) => hash(x >> 1, y >> 1, 21) < k * (1 - Math.min(1, -y / (5 * z)));
// 一顆小石頭（營火石圈、碎石用）：左上受光的橢圓
export function pebble(b, cx, cy, rx, ry, P) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    b.set(x, y, pick7(P, -(nx * 0.6 + ny * 0.8) * 0.8 + (hash(x, y, 4) - 0.5) * 0.3));
  }
}
// 粗細 w 的木棍 / 圓木：橫切面左上亮、右下暗，加上縱向木紋；cut 時兩端畫淺色斷面
export function log(b, x0, y0, x1, y1, w, P, cut) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))), px = -(y1 - y0) / n, py = (x1 - x0) / n;
  for (let k = 0; k <= n; k++) for (let d = 0; d < w; d++) {
    const o = d - (w - 1) / 2, f = w > 1 ? d / (w - 1) : 0.5, x = x0 + (x1 - x0) * k / n + px * o, y = y0 + (y1 - y0) * k / n + py * o;
    b.set(x, y, pick7(P, (0.5 - f) * 1.1 + (hash(Math.round(k / 2), d, 6) - 0.5) * 0.45));
  }
  if (cut) for (const [ex, ey] of [[x0, y0], [x1, y1]]) b.set(ex, ey, mix(P[5], [236, 206, 150], 0.5));
}

// 石柱：圓柱明暗 + 縱向凹槽 + 石塊接縫（接縫暗、接縫下一排亮）+ 裂縫 + 斷裂的頂面 + 底部青苔；旁邊掉一塊碎石
export function genPillar(C, R, z) {
  const b = builder(), P = ramp7(mix(stoneOf(C), [150, 140, 120], 0.25)), M = ramp7(mix(C.grass, [70, 110, 50], 0.3));
  const half = Math.max(2, Math.round(2.6 * z)), hh = Math.round((15 + R() * 8) * z), every = Math.max(3, Math.round(4 * z));
  const crack = new Set(); for (let x = (R() - 0.5) * half, y = -hh * (0.4 + R() * 0.4); y < -2; y++, x += R() - 0.5) crack.add(Math.round(x) + ',' + y);
  let prev = hh;
  for (let x = -half; x <= half; x++) {
    const top = prev = Math.round((prev + hh - hash(x + 20, hh, 5) * 6 * z) / 2), nx = (x + 0.5) / (half + 0.5);
    for (let y = -2; y >= -top; y--) {
      let l = -nx * 0.8 + 0.15 + (hash(x, y, 7) - 0.5) * 0.25;
      const j = -y % every;
      if (j === 0) l -= 0.35; else if (j === 1) l += 0.2;
      if (half >= 3 && (x + 30) % 2 === 0) l -= 0.15;
      if (crack.has(x + ',' + y)) l -= 0.8;
      if (y === -top) l += 0.4;
      b.set(x, y, mossAt(x, y, z, 0.55) ? pick7(M, l * 0.6) : pick7(P, l));
    }
  }
  for (let x = -half - 1; x <= half + 1; x++) { b.set(x, -1, pick7(P, 0.35 - (x / half) * 0.4)); b.set(x, 0, pick7(P, -0.45 - (x / half) * 0.3)); } // 底座
  pebble(b, half + 3 * z, -1 * z, 1.6 * z, 1.1 * z, P);
  return b.done();
}
// 斷牆：一塊塊大小不一的石磚，各自有色差與斜面（上左亮、下右暗），灰縫暗；頂端斷裂、底部長苔和草
export function genWall(C, R, z) {
  const b = builder(), P = ramp7(mix(stoneOf(C), [150, 140, 120], 0.25)), M = ramp7(mix(C.grass, [70, 110, 50], 0.3)), G = ramp7(C.grass);
  const ww = Math.round((14 + R() * 8) * z), hh = (5 + R() * 3) * z, bh = Math.max(2, Math.round(3 * z));
  // 頂端輪廓：一端較高、隨機一段段崩落（隨機漫步），不是規律的波浪
  const tops = []; for (let x = 0, h = hh * (0.7 + R() * 0.3); x < ww; x++) { if (R() < 0.3) h += (R() - 0.6) * 2.5 * z; h = Math.max(2, Math.min(hh * 1.1, h)); tops.push(Math.round(h)); }
  for (let row = 0; row * bh <= hh + bh; row++) {
    let x = -(row % 2) * 2;
    while (x < ww) {
      const bw = Math.max(3, Math.round((3 + R() * 3) * z)), tone = (R() - 0.5) * 0.4;
      for (let xx = Math.max(0, x); xx < Math.min(ww, x + bw); xx++) for (let r = 0; r < bh; r++) {
        const y = -(row * bh + r);
        if (-y > tops[xx]) continue;
        let l = tone + (hash(xx, y, 8) - 0.5) * 0.25;
        if (r === bh - 1 || xx === x + bw - 1) l = -0.5 + tone * 0.5; // 灰縫
        else if (r === bh - 2 || xx === x) l += 0.3; // 上、左斜面受光
        else if (r === 0 || xx === x + bw - 2) l -= 0.3;
        if (-y === tops[xx]) l += 0.25;
        b.set(xx - (ww >> 1), y, mossAt(xx, y, z, 0.5) ? pick7(M, l * 0.6) : pick7(P, l));
      }
      x += bw;
    }
  }
  for (let k = 0; k < ww / 2; k++) { const x = Math.round(R() * ww) - (ww >> 1), h = 1 + ((R() * 3 * z) | 0); for (let j = 0; j < h; j++) b.set(x, -j, pick7(G, j / h - 0.2)); }
  return b.done();
}
// 營火：一圈各自受光的石頭、灰燼裡零星的紅色餘燼、兩根交叉的圓木（樹皮紋、淺色斷面）；火焰在 pond.js 每幀畫
export function genCampfire(C, R = Math.random, z = 1) {
  const b = builder(), S = ramp7(mix(stoneOf(C), [140, 135, 125], 0.3)), Wd = ramp7(mix(C.trunk, [120, 84, 54], 0.4)), A = ramp7([92, 84, 78]);
  const rx = 5.5 * z, ry = 2 * z, ring = [];
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; ring.push([Math.cos(a) * rx, Math.sin(a) * ry - 2 * z, Math.sin(a)]); }
  for (const [x, y, sn] of ring) if (sn <= 0) pebble(b, x, y, 1.4 * z, 1 * z, S);
  for (let y = Math.round(-3 * z); y <= 0; y++) for (let x = Math.round(-3.5 * z); x <= 3.5 * z; x++) {
    if ((x / (3.5 * z)) ** 2 + ((y + 1.5 * z) / (1.6 * z)) ** 2 > 1) continue;
    const h = hash(x, y, 12);
    b.set(x, y, h > 0.85 ? [226, 92, 40] : h > 0.75 ? [150, 52, 30] : pick7(A, -0.6 + h * 0.6)); // 灰燼與餘燼
  }
  log(b, -3.5 * z, -1.2 * z, 3 * z, -3.5 * z, Math.max(2, Math.round(1.5 * z)), Wd, true);
  log(b, -3 * z, -3.5 * z, 3.5 * z, -1.2 * z, Math.max(2, Math.round(1.5 * z)), Wd, true);
  for (const [x, y, sn] of ring) if (sn > 0) pebble(b, x, y + 0.5 * z, 1.3 * z, 0.9 * z, S);
  return b.done({ anim: 'fire' });
}
// 插在土堆上的鏟子：土堆有明暗與土塊；鏟面金屬左亮右暗、帶鏽斑；木柄有木紋，頂端 D 形握把
export function genShovel(C, R = Math.random, z = 1) {
  const b = builder(), D = ramp7(C.dirt), Mt = ramp7(metalOf(C)), Ru = ramp7([150, 86, 52]), Wd = ramp7(woodOf(C));
  for (let y = Math.round(-1.4 * z); y <= 0; y++) for (let x = Math.round(-3.5 * z); x <= 3.5 * z; x++) {
    const nx = x / (3.5 * z), ny = (y + 0.2) / (1.4 * z);
    if (nx * nx + ny * ny > 1) continue;
    b.set(x, y, pick7(D, -(nx * 0.5 + ny) * 0.7 + (hash(x, y, 13) - 0.5) * 0.5));
  }
  log(b, 0, -3 * z, 3 * z, -14 * z, Math.max(1, Math.round(z)), Wd, false);
  for (let x = Math.round(2 * z); x <= 4 * z; x++) b.set(x, Math.round(-14.5 * z), pick7(Wd, 0.2)); // 握把
  b.set(2 * z, -14 * z, pick7(Wd, 0)); b.set(4 * z, -14 * z, pick7(Wd, -0.4));
  const bw = Math.max(1, Math.round(1.5 * z)), bh = Math.round(4 * z);
  for (let y = -bh; y <= -1; y++) for (let x = -bw; x <= bw; x++) {
    const l = -(x / bw) * 0.6 + (y === -bh ? 0.45 : 0) + (hash(x, y, 14) - 0.5) * 0.25;
    b.set(x, y, hash(x, y, 15) < 0.18 ? pick7(Ru, l) : pick7(Mt, l));
  }
  return b.done();
}
// 劈在樹樁上的斧頭：樹樁圓柱 + 縱向樹皮紋 + 根部外擴；頂面年輪（同心橢圓深淺交替）；斧頭金屬刃口亮
export function genAxeStump(C, R = Math.random, z = 1) {
  const b = builder(), Bk = ramp7(shade(C.trunk, 0.95)), Wd = ramp7(mix(C.trunk, [232, 200, 150], 0.45)), Mt = ramp7(metalOf(C)), Hd = ramp7(woodOf(C));
  const rx = 3.5 * z, th = Math.round(5 * z), ry = 1.3 * z;
  for (let y = 0; y >= -th; y--) for (let x = Math.round(-rx) - (y === 0 ? 1 : 0); x <= rx + (y === 0 ? 1 : 0); x++) {
    const nx = x / (rx + 0.5);
    b.set(x, y, pick7(Bk, -nx * 0.8 + (hash(x, y >> 1, 16) < 0.3 ? -0.45 : 0.05) + (y === 0 ? -0.3 : 0)));
  }
  for (let y = Math.round(-th - ry); y <= -th + ry; y++) for (let x = Math.round(-rx); x <= rx; x++) {
    const nx = x / rx, ny = (y + th) / ry, d = Math.hypot(nx, ny);
    if (d > 1) continue;
    b.set(x, y, d > 0.82 ? pick7(Bk, 0.2) : pick7(Wd, (Math.floor(d * 5) % 2 ? -0.25 : 0.2) - d * 0.2));
  }
  log(b, z, -th - z, 5 * z, -13 * z, Math.max(1, Math.round(z)), Hd, false);
  for (let k = 0; k < Math.max(3, 3 * z); k++) for (let j = 0; j < Math.max(2, 2 * z); j++)
    b.set(-0.5 * z + k * 0.8, -th - z - j + k * 0.3, pick7(Mt, j === 0 ? 0.7 : -k * 0.25)); // 斧刃：卡進木頭那一邊暗、刃口亮
  return b.done();
}
// 被遺忘的木桶：木板圓柱（板縫、左亮右暗）、兩道金屬箍（有亮點）、桶口看得到暗的內側與一點積水、細提把
export function genBucket(C, R = Math.random, z = 1) {
  const b = builder(), Wd = ramp7(woodOf(C)), Mt = ramp7(metalOf(C)), hh = Math.round(6 * z);
  for (let y = 0; y >= -hh; y--) {
    const w = (2.2 + (-y / hh) * 1.1) * z;
    for (let x = Math.round(-w); x <= w; x++) {
      const nx = x / (w + 0.5), band = Math.round(-y) === Math.round(hh * 0.2) || Math.round(-y) === Math.round(hh * 0.75);
      const l = -nx * 0.85 + 0.1 + ((x + 40) % 2 === 0 ? -0.2 : 0) + (hash(x, y, 17) - 0.5) * 0.2;
      b.set(x, y, band ? pick7(Mt, l + (Math.abs(nx + 0.5) < 0.2 ? 0.6 : 0)) : pick7(Wd, l));
    }
  }
  const tw = 3.3 * z, ry = 1.1 * z;
  for (let y = Math.round(-hh - ry); y <= -hh + ry; y++) for (let x = Math.round(-tw); x <= tw; x++) {
    const nx = x / tw, ny = (y + hh) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    b.set(x, y, d > 0.55 ? pick7(Wd, ny < 0 ? 0.45 : 0) : ny > 0.1 && d < 0.3 ? [120, 160, 168] : pick7(Wd, -1)); // 桶口：亮的邊、暗的內側、底部一點積水
  }
  for (let k = 0; k <= 8; k++) { const a = Math.PI * (1 + k / 8); b.set(Math.cos(a) * tw, -hh - 1 + Math.sin(a) * 3 * z, pick7(Mt, k < 4 ? 0.4 : -0.2)); }
  return b.done();
}

// 名稱 = <分類>-<用途>-<名字>，和 assets/ 的檔名規則一致
export const LIB = {
  'flora-back-oak': genOak,
  'flora-back-pine': genPine,
  'flora-back-bush': genBush,
  'flora-frame-pine': (C, R, z) => genPine(C, R, z * 1.9),
  'flora-frame-oak': (C, R, z) => genOak(C, R, z * 1.7),
  'flora-frame-bush': (C, R, z) => genBush(C, R, z * 1.8),
  'flora-ground-bush': (C, R, z) => genBush(C, R, z * 0.7),
  'flora-ground-grass': (C, R) => genTuft(C, R, 1, false),
  'flora-ground-flowers': (C, R) => genTuft(C, R, 1, true),
  'flora-shore-grass': (C, R) => genTuft(C, R, 1, R() < 0.2, true),
  'flora-ground-mushroom': genMushroom,
  'flora-back-bare': (C, R, z) => genBare(C, R, z, C.grass[0] > 200),
  'flora-frame-bare': (C, R, z) => genBare(C, R, z * 1.7, C.grass[0] > 200),
  'flora-back-palm': (C, R, z) => genPalm(C, R, z, false),
  'flora-frame-palm': (C, R, z) => genPalm(C, R, z * 1.5, false),
  'flora-back-coconut': (C, R, z) => genPalm(C, R, z, true),
  'flora-frame-coconut': (C, R, z) => genPalm(C, R, z * 1.5, true),
  'flora-back-cactus': genCactus,
  'flora-frame-cactus': (C, R, z) => genCactus(C, R, z * 1.6),
  'flora-ground-dunegrass': (C, R) => genTuft({ ...C, grass: mix(C.grass, [200, 190, 130], 0.4) }, R, 1, false),
  'rock-ground-shells': genShells,
  'flora-shore-reeds': genReeds,
  'rock-shore-boulder': (C, R, z) => genRock(C, R, z, 5.5, true),
  'rock-ground-boulder': (C, R, z) => genRock(C, R, z, 5, true),
  'rock-water-stone': (C, R, z) => genRock(C, R, z, 3.5, true),
  'rock-sea-stack': (C, R, z) => genRock(C, R, z, 4.5, false), // 海裡的礁石：沒有青苔
  'rock-ground-pebbles': genPebbles,
  'prop-feature-ruin-pillar': genPillar,
  'prop-feature-ruin-wall': genWall,
  'prop-feature-campfire': genCampfire,
  'prop-feature-shovel': genShovel,
  'prop-feature-axe-stump': genAxeStump,
  'prop-feature-bucket': genBucket,
};
