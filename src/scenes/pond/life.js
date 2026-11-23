// 水上的生命：荷葉與睡蓮、魚影與錦鯉、綠頭鴨、青蛙。都在 5 秒循環裡跑整數圈。
import { hash, hex, mix, shade } from '../../core/color.js';
import { TAU, phase } from '../../core/math.js';
import { ramp7 } from '../../sprites/library.js';
import { speciesById } from '../../core/ecology.js';

// 荷葉（寫實）：每片色相略不同（偶有泛黃），放射狀葉脈、左上受光、邊緣微捲（上緣亮、下緣暗），沒有深色外框；
// 有的開睡蓮：白或粉紅的花瓣分亮暗兩面、黃色花心
function buildLilies({ cfg, eco, W, s, R, C, rx, ry, persp, depth, pickWater }) {
  const P7 = c => ramp7(c).map(v => v.map(Math.round));
  const lilies = [];
  const n = eco.lilies.length && !eco.saltwater ? cfg.lilies : 0; // 這裡、這季沒有睡蓮就不放
  for (let k = 0; k < n; k++) {
    const i = pickWater(i => depth[i] >= 5 * s);
    if (i < 0) break;
    const P = P7(mix(mix(C.grass, [60, 140, 70], 0.5), [170, 160, 70], R() < 0.2 ? 0.45 : R() * 0.15));
    const r = (3 + R() * 2.2) * s * persp(i / W), pry = r * 0.6 * (ry / rx * 1.3), rot = R() * TAU, nv = 7 + ((R() * 4) | 0), pts = [];
    for (let yy = -Math.ceil(pry); yy <= Math.ceil(pry); yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
      const nx = xx / r, ny = yy / pry, d = Math.hypot(nx, ny);
      if (d > 1 + (hash(xx, yy, k) - 0.5) * 0.15) continue;
      const a = Math.atan2(ny, nx), da = ((a - rot) % TAU + 3 * Math.PI) % TAU - Math.PI; // 缺口
      if (Math.abs(da) < 0.35 + 0.1 * (1 - d)) continue;
      let l = -(nx * 0.5 + ny * 0.8) * 0.35 + (hash(xx, yy, k + 40) - 0.5) * 0.3;
      if (d > 0.3 && Math.abs(((da * nv / TAU) % 1 + 1) % 1 - 0.5) > 0.42) l -= 0.3; // 葉脈
      if (d > 0.8) l += ny < 0 ? 0.4 : -0.35; // 捲起的葉緣
      pts.push([xx, yy, P[Math.max(0, Math.min(6, Math.round(3.5 + l * 3)))]]);
    }
    const sp = eco.lilies[(R() * eco.lilies.length) | 0];
    if (R() < 0.3) { // 開花：花色依物種（白睡蓮、藍睡蓮、粉紅的蓮）
      const pc = hex(sp.color || '#ffffff'), Pe = [pc, shade(pc, 0.84)];
      for (const [dx, dy, t] of [[-1, -1, 1], [1, -1, 0], [0, -2, 0], [-1, -2, 1], [1, -2, 0], [0, -3, 0], [-2, -1, 1], [2, -1, 1]]) pts.push([dx, dy, Pe[t]]);
      pts.push([0, -1, [238, 196, 72]]);
    }
    const keys = new Set(pts.map(([xx, yy]) => xx + ',' + yy));
    lilies.push({ species: sp.id, x: i % W, y: (i / W) | 0, cycles: 1, ph: 1.7 * k, pts, shadow: pts.filter(([xx, yy]) => !keys.has(xx + ',' + (yy + 1))) });
  }
  return lilies;
}

// 水生動物（fauna）：魚（水下暗影，四成是錦鯉）沿小橢圓游、鴨子來回划水帶 V 形水痕、青蛙蹲在荷葉上
export function buildLife(G) {
  const { cfg, eco, W, H, s, R, rx, ry, persp, jitter, depth, pickWater } = G;
  const pick = list => list[(R() * list.length) | 0];
  const wild = eco.fish.filter(f => f.kind === 'fish'), koi = eco.fish.find(f => f.kind === 'fish:koi');
  const lilies = buildLilies(G);
  const loopOk = (x, y, ax, ay) => {
    for (let a = 0; a < TAU; a += TAU / 16) {
      const xx = Math.round(x + Math.cos(a) * ax), yy = Math.round(y + Math.sin(a) * ay);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || depth[yy * W + xx] < 3 * s) return false;
    }
    return true;
  };
  let pool = null;
  const swimmers = (n, a0, a1, flat, from, koiSp = null) => {
    pool = from;
    if (!from.length) return [];
    const list = [];
    for (let k = 0; k < n; k++) for (let tries = 0; tries < 40; tries++) {
      const i = pickWater(i => depth[i] >= 4 * s);
      if (i < 0) break;
      const x = i % W, y = (i / W) | 0, ax = jitter(a0, a1) * s, ay = flat ? 1 : ax * Math.min(0.8, ry / rx * 1.2);
      if (!loopOk(x, y, ax + 4 * s, ay)) continue;
      list.push({ x, y, ax, ay, dir: R() < 0.5 ? 1 : -1, ph: R() * TAU, koi: R() < 0.4, hen: R() < 0.45, len: Math.max(5, Math.round(7 * persp(y))) });
      const f = list[list.length - 1]; // 錦鯉只出現在東亞的公園池塘；其他都是當地原生魚的水下暗影
      const native = pool.filter(p => p.kind !== 'fish:koi');
      f.koi = !!koiSp && (f.koi || !native.length);
      f.species = f.koi ? koiSp.id : pick(native).id;
      break;
    }
    return list;
  };
  const fish = swimmers(Math.round(3 * cfg.fauna), 5, 13, false, koi ? [...wild, koi] : wild, koi);
  const ducks = swimmers(Math.round(0.8 * cfg.fauna), 5, 10, true, eco.ducks);
  for (const d of ducks) d.look = speciesById(d.species)?.color || 'mallard';
  const frogs = eco.frogs.length ? lilies.filter(() => R() < 0.35 * cfg.fauna).slice(0, Math.ceil(cfg.fauna)).map(l => ({ l, ph: R() * TAU, species: pick(eco.frogs).id })) : [];
  return { lilies, fish, ducks, frogs };
}

// ---------- 每幀 ----------
function fishAt(f, t) {
  const a = phase(t, 1) * f.dir + f.ph, x = f.x + Math.cos(a) * f.ax, y = f.y + Math.sin(a) * f.ay;
  let vx = -Math.sin(a) * f.ax * f.dir, vy = Math.cos(a) * f.ay * f.dir; const n = Math.hypot(vx, vy) || 1;
  vx /= n; vy /= n;
  const wig = Math.sin(phase(t, 15) + f.ph) > 0 ? 1 : -1, pts = [];
  for (let k = 0; k <= f.len; k++) {
    const tail = k >= f.len - 1, sw = tail ? wig * (k - f.len + 2) : 0;
    pts.push([x - vx * k - vy * sw, y - vy * k + vx * sw, k]);
    if (k > 0 && k < f.len - 2) pts.push([x - vx * k + vy, y - vy * k - vx, k]); // 身體 2 px 寬
    if (k === f.len) pts.push([x - vx * k + vy * wig, y - vy * k - vx * wig, k]); // 尾鰭分岔
  }
  return pts;
}
function duckAt(d, t) {
  const a = phase(t, 1) + d.ph, c = Math.cos(a) * d.dir;
  return { x: Math.round(d.x + Math.sin(a) * d.ax * d.dir), y: d.y, face: c >= 0 ? 1 : -1, fast: Math.abs(c) > 0.35 };
}
const lilyDy = (S, l, t) => (S.st[6] && Math.sin(phase(t, 1) + l.ph) > 0.4 ? 1 : 0); // 步驟 6 時上下只動一個像素，彼此錯開

// 色號階段：荷葉的 1 px 陰影、魚的水下暗影、鴨子的影子與 V 形水痕
export function toneLife(S, { t, idx, put }) {
  const { W, H, water } = S;
  if (S.st[6]) for (const l of S.lilies) {
    const dy = Math.sin(phase(t, 1) + l.ph) > 0.4 ? 1 : 0;
    for (const [xx, yy] of l.shadow) put(l.x + xx, l.y + yy + dy + 1, 0);
  }
  const darken = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && water[y * W + x] && idx[y * W + x] <= 6) idx[y * W + x] = Math.max(0, idx[y * W + x] - 2); };
  for (const f of S.fish) if (!f.koi) for (const [x, y] of fishAt(f, t)) darken(x, y);
  for (const d of S.ducks) {
    const { x, y, face, fast } = duckAt(d, t);
    for (let k = -5; k <= 4; k++) darken(x + face * k, y + 1); // 鴨子在水上的影子
    if (fast) for (let k = 6; k <= 13; k++) if ((k + Math.floor(t * 8)) % 2) { put(x - face * k, y - Math.round(k * 0.35), 5); put(x - face * k, y + 1 + Math.round(k * 0.35), 5); }
  }
}

// 綠頭鴨（寫實）：公鴨綠頭帶金屬光澤、白頸環、栗色胸、灰色身體有細紋、藍紫色翼鏡、黑尾；母鴨褐色斑駁。
// 逐像素再依上亮下暗做形體明暗，吃水線那一排壓暗
const DUCK = ['........hG..', '.......hGGYy', '.......GoGy.', '.......WCc..', '..TBBBBBCC..', '.TbSSbBBBCc.', '..dddddddd..'];
const DRAKE = { h: [96, 170, 120], G: [34, 88, 64], o: [16, 22, 18], Y: [228, 196, 80], y: [176, 140, 56], W: [240, 236, 226], C: [128, 72, 50], c: [96, 54, 40], B: [186, 182, 168], b: [138, 134, 124], S: [74, 82, 170], T: [34, 34, 38], d: [100, 104, 104] };
const HEN = { h: [176, 140, 98], G: [136, 100, 66], o: [24, 18, 14], Y: [214, 140, 60], y: [160, 96, 44], W: [150, 114, 76], C: [150, 112, 74], c: [118, 86, 56], B: [160, 124, 84], b: [118, 88, 60], S: [74, 82, 170], T: [92, 68, 46], d: [96, 80, 62] };

// 其他鴨種：[公, 母]（雌雄同色的種類兩個一樣）
const SPOTBILL = { ...HEN, h: [120, 92, 64], G: [70, 56, 44], W: [196, 176, 140], Y: [40, 40, 40], y: [226, 190, 60], S: [60, 110, 140] };
const MUSCOVY = { ...DRAKE, h: [236, 232, 228], G: [190, 50, 40], W: [236, 232, 228], C: [40, 44, 40], c: [28, 32, 30], B: [52, 60, 54], b: [36, 42, 38], S: [60, 120, 90], T: [30, 32, 30], d: [40, 44, 40], Y: [70, 60, 60], y: [50, 44, 44] };
const WHISTLING = { ...HEN, h: [240, 236, 228], G: [30, 28, 26], W: [140, 70, 40], C: [130, 64, 36], c: [96, 50, 30], B: [120, 100, 80], b: [80, 64, 50], T: [30, 28, 26], Y: [40, 40, 40], y: [30, 30, 30] };
const EIDER = { ...DRAKE, h: [236, 236, 230], G: [30, 32, 30], o: [20, 20, 20], W: [240, 240, 236], C: [230, 214, 190], c: [200, 180, 150], B: [236, 236, 230], b: [30, 30, 32], S: [30, 30, 32], T: [30, 30, 32], d: [30, 30, 32], Y: [150, 160, 120], y: [120, 130, 100] };
const EIDER_HEN = { ...HEN, h: [140, 96, 60], G: [120, 82, 50], W: [140, 96, 60], B: [130, 90, 56], b: [90, 60, 38] };
const DUCK_LOOKS = { mallard: [DRAKE, HEN], spotbill: [SPOTBILL, SPOTBILL], muscovy: [MUSCOVY, MUSCOVY], whistling: [WHISTLING, WHISTLING], eider: [EIDER, EIDER_HEN] };

// 顏色階段：錦鯉（水面下，和水混三成）、荷葉、青蛙、鴨子
export function paintLife(S, out, { t, idx, pset }) {
  const { W, H, water, RAMP } = S;
  for (const f of S.fish) if (f.koi) for (const [x, y, k] of fishAt(f, t)) {
    const X = Math.round(x), Y = Math.round(y);
    if (X < 0 || Y < 0 || X >= W || Y >= H || !water[Y * W + X]) continue;
    const base = k === f.len ? [236, 150, 90] : (k + (f.ph * 3 | 0)) % 3 === 1 ? [244, 238, 226] : [232, 112, 46];
    pset(X, Y, mix(base, RAMP[idx[Y * W + X]], 0.3).map(Math.round));
  }
  for (const l of S.lilies) for (const [xx, yy, c] of l.pts) pset(l.x + xx, l.y + yy + lilyDy(S, l, t), c);
  // 青蛙：蹲在荷葉中間，偶爾眨眼、鼓起喉嚨
  for (const { l, ph } of S.frogs) {
    const x = l.x, y = l.y + lilyDy(S, l, t), blink = Math.sin(phase(t, 2) + ph) > 0.95, croak = Math.sin(phase(t, 3) + ph * 2) > 0.85;
    const G = [104, 156, 62], g = [70, 112, 44], E = blink ? g : [30, 40, 26];
    pset(x - 1, y - 2, G); pset(x + 1, y - 2, G); pset(x - 1, y - 3, E); pset(x + 1, y - 3, E);
    pset(x, y - 2, croak ? [236, 226, 160] : G); pset(x - 1, y - 1, G); pset(x, y - 1, [150, 190, 90]); pset(x + 1, y - 1, G);
    pset(x - 2, y - 1, g); pset(x + 2, y - 1, g); pset(x - 2, y, g); pset(x + 2, y, g);
  }
  // 鴨子：隨波上下 1 px，朝前進方向
  for (const d of S.ducks) {
    const { x, y, face } = duckAt(d, t), bob = Math.sin(phase(t, 3) + d.ph) > 0.5 ? 1 : 0, L = DUCK_LOOKS[d.look] || DUCK_LOOKS.mallard, P = d.hen ? L[1] : L[0];
    DUCK.forEach((row, r) => [...row].forEach((ch, c) => {
      if (!P[ch]) return;
      let col = P[ch];
      if ('BbCc'.includes(ch)) { const h = hash(c, r, d.hen ? 3 : 4); col = shade(col, d.hen ? (h < 0.35 ? 0.78 : h > 0.8 ? 1.12 : 1) : (h < 0.25 ? 0.9 : 1)); } // 羽毛斑紋 / 細紋
      col = shade(col, 1.08 - r * 0.035); // 上亮下暗
      pset(x + face * (c - 6), y - 6 + r + bob, col.map(Math.round));
    }));
  }
}
