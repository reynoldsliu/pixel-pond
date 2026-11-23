// 水面：教學的六步。水的每個像素只挑 10 色色階裡的一個色號（tone），最後才一次換成顏色。
//   步驟 1、2 靜態色號；3 樹影；4 岸邊；5 對岸倒影與水線；6 漣漪、亮點、落葉
import { hash, lum, shade } from '../../core/color.js';
import { LOOP } from '../../core/config.js';
import { phase, wrap } from '../../core/math.js';
import { GLINT, RIPPLE } from '../effects.js';
import { swayDx } from './objects.js';

// 步驟 1、2：靜態色號；pickWater 給其他圖層在水上隨機挑位置
export function buildWaterTones({ cfg, W, N, s, R, st, kk, water, depth, rowOf }) {
  const baseIdx = new Uint8Array(N).fill(255), wIdx = [];
  for (let i = 0; i < N; i++) {
    if (!water[i]) continue;
    const x = i % W, y = (i / W) | 0, d = depth[i];
    let t;
    if (st[1]) t = d > cfg.depth * 0.5 * s ? 1 : d < 3 * s ? 3 : 2;
    else t = ((x & 15) < 3 && (y & 15) === 5) || (((x + 8) & 15) < 2 && (y & 15) === 13) ? 3 : 2; // 原始 16×16 貼圖
    if (st[2] && d >= 3 * s) { const row = rowOf(i); if (row >= 28 * kk) t = 4; else if (row >= 14 * kk) t = 3; }
    baseIdx[i] = t;
    wIdx.push(i);
  }
  const pickWater = ok => { for (let n = 0; n < 400; n++) { const i = wIdx[(R() * wIdx.length) | 0]; if (ok(i)) return i; } return -1; };
  return { baseIdx, wIdx, pickWater };
}

// 依物件算的水面細節：接觸亮線、樹影、拍岸、水滴、亮點、落葉。需要 G.objs（物件圖層）
export function buildWaterDetails(G) {
  const { cfg, W, H, N, s, R, kk, cx, cy, water, depth, distW, topY, rowOf, isFarWater, objs, wIdx, pickWater } = G;

  // 步驟 4 用：立在水裡的物件旁邊與下方（不在上方）的接觸亮線位置
  const contact = new Set();
  for (const o of objs) {
    if (o.role !== 'shore' && o.role !== 'water') continue; // 岸邊垂草（lip）不畫接觸線，不然水邊一整圈都是亮線
    const own = new Set();
    for (let r = 0; r < o.h; r++) for (let c = 0; c < o.w; c++) if (o.px[(r * o.w + c) * 4 + 3]) {
      const x = o.x1 + c, y = o.y1 + r;
      if (x >= 0 && y >= 0 && x < W && y < H) own.add(y * W + x);
    }
    for (const i of own) {
      if (!water[i]) continue;
      const x = i % W;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
        const j = i + dy * W + dx;
        if (x + dx >= 0 && x + dx < W && j < N && water[j] && !own.has(j)) contact.add(j);
      }
    }
  }

  // 步驟 3 用：後方物件的亮度分 3 個平色調（最暗 15% → 0、到 75% → 1、其餘 → 2）
  const backs = objs.filter(o => o.role === 'back' && o.base < cy);
  const lums = [];
  for (const T of backs) for (let o = 0; o < T.px.length; o += 4) if (T.px[o + 3]) lums.push(lum(T.px.subarray(o, o + 3)));
  lums.sort((a, b) => a - b);
  const darkCut = lums[Math.floor(lums.length * 0.15)] ?? 0;
  const reflTrees = backs.map(T => {
    const tone = new Uint8Array(T.w * T.h).fill(255);
    for (let p = 0; p < tone.length; p++) if (T.px[p * 4 + 3]) {
      const l = lum(T.px.subarray(p * 4, p * 4 + 3));
      tone[p] = l < darkCut ? 0 : l < 110 ? 1 : 2; // 教學：最暗 15% → 0、亮度 < 110 → 1、其餘 2
    }
    // 倒影從樹幹正下方的水線開始（樹站在對岸土坡後面，若從樹根算，倒影大半會落在岸上）
    const wt = topY[Math.min(W - 1, Math.max(0, T.cx))];
    T.tone = tone; T.root = wt > T.base ? wt : T.base;
    return T;
  });

  // 步驟 4：近岸/側岸 1 px 泥上淺水、拍岸亮線的位置
  const shallow = wIdx.filter(i => distW[i] < 1.5 && (i / W | 0) > cy); // 教學：只在池塘中線以下的岸邊
  const rings = [Math.round(2 * s), Math.round(3 * s)];
  const lap = wIdx.filter(i => !isFarWater(i) && rings.includes(Math.floor(depth[i]))).map(i => {
    const x = i % W, y = (i / W) | 0;
    return { i, ring: Math.floor(depth[i]), along: Math.atan2((y - cy) * 2.2, x - cx) * 60 };
  });
  const farCols = [];
  for (let x = 0; x < W; x++) if (topY[x] >= 0 && topY[x] < cy) farCols.push(x);

  // 步驟 6：水滴、亮點、落葉都在 5 秒循環裡排好時間
  const drops = [], glints = [], leaves = [];
  for (let k = 0; k < Math.round(cfg.ripples * 2); k++) { // 預設每循環 1 滴
    const i = pickWater(i => depth[i] >= 5 * s);
    if (i >= 0) drops.push({ x: i % W, y: (i / W) | 0, t0: R() * LOOP });
  }
  for (let k = 0; k < Math.round(cfg.sparkles * 33); k++) { // 預設 20 個，平均約 2–3 個同時亮
    const i = pickWater(i => depth[i] >= 3 * s && rowOf(i) >= 14 * kk);
    if (i >= 0) glints.push({ x: i % W, y: (i / W) | 0, t0: R() * LOOP });
  }
  const leafTrees = reflTrees.filter(T => T.sway && topY[Math.min(W - 1, Math.max(0, T.cx))] >= 0);
  for (let k = 0, n = 0; k < cfg.leaves && leafTrees.length && n < 200; n++) {
    const T = leafTrees[(R() * leafTrees.length) | 0];
    const x = Math.round(Math.min(W - 4, Math.max(0, T.cx + (R() - 0.5) * T.r * 1.4)));
    if (topY[x] < 0) continue;
    const y = topY[x] + Math.round((4 + R() * 20 * kk) * s);
    if (y >= H || !water[y * W + x]) continue;
    const L = { x, y, y0: T.cy + R() * T.r * 0.5, t0: R() * LOOP, ph: R() * 7 };
    leaves.push(L); drops.push({ x, y, t0: L.t0 + 1.2 }); k++;
  }

  return { contact: [...contact], reflTrees, shallow, lap, farCols, drops, glints, leaves, bankRows: Math.round(6 * s), solidRows: Math.round(3 * s) };
}

// ---------- 每幀：色號階段（ctx.idx 是這一格的色號） ----------

// 5. 對岸：水線下一條暗線；倒映岸泥/岸草 6 行（1–3 行實心，之後隔行並晃 1 px）；陰影裡飄過淡淡的暗波紋
//    先畫這層，樹影再用「暗的贏」蓋上去，樹影才不會被岸的倒影吃掉
export function toneBankReflection(S, { t, idx }) {
  if (!S.st[5]) return;
  const { W, H, N, water, topY } = S;
  for (const x of S.farCols) {
    const top = topY[x];
    idx[top * W + x] = 0;
    for (let k = 1; k <= S.bankRows; k++) {
      const y = top + k;
      if (y >= H || !water[y * W + x] || (k > S.solidRows && k % 2)) continue;
      const dx = k > S.solidRows ? Math.round(Math.sin(y * 0.45 - phase(t, 2))) : 0;
      const sy = top - k, sx = Math.min(W - 1, Math.max(0, x + dx));
      if (sy < 0 || water[sy * W + sx]) continue;
      const o = (sy * W + sx) * 3, g = S.land.subarray(o, o + 3); // 教學：依岸上像素亮度挑 0 / 9（偏綠）/ 8
      idx[y * W + x] = lum(g) < 36 ? 0 : g[1] > g[0] + 12 ? 9 : 8;
    }
    for (let k = 2; k <= 5; k++) { // 倒影裡淡淡的暗波紋
      const i = (top + k) * W + x, v = idx[i];
      if (i < N && water[i] && (v === 0 || v === 8 || v === 9) && Math.sin(x * 0.6 - phase(t, 1) + k * 1.7) + 0.6 * Math.sin(x * 0.23 + k - phase(t, 1)) > 0.95) idx[i] = v === 9 ? 0 : 1;
    }
  }
}

// 3. 樹影：倒過來、壓到 55%；前 3 行不動，之後逐行整像素錯開；重疊時暗的贏
export function toneTreeReflection(S, { t, idx }) {
  if (!S.st[3]) return;
  const { W, H, cfg, water } = S;
  for (const T of S.reflTrees) {
    for (let r = 0; ; r++) {
      const src = Math.floor(r / 0.55), y = T.root + r;
      if (src >= T.h || y >= H) break;
      const amp = r < 3 ? 0 : r < 30 ? 1 : 2;
      const srow = T.h - 1 - src;
      const dx = Math.round(amp * cfg.wobble * Math.sin(y * 0.75 - phase(t, 2))) + swayDx(T, srow, t, cfg.wind);
      for (let c = 0; c < T.w; c++) {
        const tone = T.tone[srow * T.w + c], x = T.x1 + c + dx;
        if (tone === 255 || x < 0 || x >= W) continue;
        const i = y * W + x;
        if (water[i] && tone < idx[i]) idx[i] = tone;
      }
    }
  }
}

// 4. 岸邊：泥上淺水；拍岸短亮線在離岸 2 px 與 3 px 間來回（每循環兩次）；水中物件旁與下方的斷續亮線
export function toneShore(S, { t, idx }) {
  if (!S.st[4]) return;
  const { W } = S;
  for (const i of S.shallow) if (idx[i] >= 3) idx[i] = 7;
  const ring = Math.sin(phase(t, 2)) > 0.35 ? 1 : 0;
  for (const p of S.lap) {
    if (p.ring !== Math.round((2 + ring) * S.s) || idx[p.i] < 2 || idx[p.i] > 6) continue;
    if (Math.sin(p.along * 0.55 - phase(t, 2)) + 0.6 * Math.sin(p.along * 0.23 + 1.3 - phase(t, 1)) > 0.55) idx[p.i] = 5;
  }
  for (const i of S.contact) if (idx[i] >= 1 && Math.sin((i % W) * 0.9 + ((i / W) | 0) * 0.4 - phase(t, 2)) > 0.3) idx[i] = 5;
}

// 6. 亮點、漣漪、浮葉的 1 px 陰影
export function toneSurfaceLife(S, { t, put }) {
  if (!S.st[6]) return;
  for (const g of S.glints) {
    const u = wrap(t - g.t0) / 0.6;
    if (u >= 1) continue;
    for (const [dx, tone] of GLINT.find(([until]) => u < until)[1]) put(g.x + dx, g.y, tone);
  }
  for (const d of S.drops) {
    const k = Math.floor(wrap(t - d.t0) / 0.2);
    if (k < RIPPLE.length) for (const [dx, dy] of RIPPLE[k]) put(d.x + dx, d.y + dy, k < 3 ? 6 : 5);
  }
  for (const L of S.leaves) {
    const u = wrap(t - L.t0);
    if (u >= 1.2 && u < 4.2) { const x = Math.round(L.x + 3 * (u - 1.2)); put(x, L.y + 1, 0); put(x + 1, L.y + 1, 0); put(x - 1, L.y, 5); }
  }
}

// ---------- 每幀：顏色階段 ----------

// 5. 水線上下爬動（每循環一次）
export function paintWaterline(S, out, { t, pset }) {
  if (!S.st[5]) return;
  for (const x of S.farCols) {
    const y = S.topY[x] - 1;
    if (y >= 0 && Math.sin(x * 0.35 - phase(t, 1)) + 0.5 * Math.sin(x * 0.13 + 1 - phase(t, 1)) > 0.6) pset(x, y, S.RAMP[0]);
  }
}

// 6. 葉子：落 1.2 秒、浮 3 秒（每秒漂 3 px）、沉 0.6 秒
export function paintLeaves(S, out, { t, pset }) {
  if (!S.st[6]) return;
  const { W, C, water, RAMP } = S;
  for (const L of S.leaves) {
    const u = wrap(t - L.t0);
    if (u < 1.2) {
      const f = u / 1.2, x = L.x - 3 * (1 - f) + Math.sin(u * 5 + L.ph) * 1.5, y = L.y0 + (L.y - L.y0) * f;
      pset(x, y, C.leaf);
      if (Math.sin(phase(t, 10) + L.ph) > 0) pset(x + 1, y, C.leaf); else pset(x, y + 1, shade(C.leaf, 0.8));
    } else if (u < 4.2) {
      const x = Math.round(L.x + 3 * (u - 1.2));
      if (water[L.y * W + x]) { pset(x, L.y, C.leaf); pset(x + 1, L.y, shade(C.leaf, 0.85)); }
    } else if (u < 4.8) {
      const x = Math.round(L.x + 9);
      if (water[L.y * W + x]) pset(x, L.y, RAMP[Math.max(0, S.baseIdx[L.y * W + x] - 1)]);
    }
  }
}

// ---------- 海與大湖 ----------
// 湧浪：一道道浪峰從遠方往岸邊推進（越近間距越大 = 透視），浪峰亮一兩階、浪谷暗一階；風大時浪峰偶爾碎成白浪
export function toneSwell(S, { t, idx }) {
  if (!S.sea && S.habitat !== 'lake') return;
  const { W, hz, GH, s, cfg } = S, lake = !S.sea, K = lake ? 22 : 30;
  for (const i of S.wIdx) {
    const x = i % W, y = (i / W) | 0, v = Math.max(0.002, (y - hz) / GH), z = Math.sqrt(v) * K;
    // 一道浪在畫面上佔幾個像素（越近越寬）；浪峰、浪谷都只畫 1–2 px 的細線，不然會變成粗條紋
    const span = (2 * Math.PI) / (2.2 * K / (2 * Math.sqrt(v) * GH)), w = z * 2.2 - phase(t, 2) + Math.sin(x / (18 * s * (0.4 + v)) + z) * 0.8;
    const f = (((w / (2 * Math.PI)) % 1) + 1) % 1, px = f * span, tone = idx[i];
    if (tone > 4 || span < 2) continue;
    const broken = hash(x >> 2, Math.floor(w / (2 * Math.PI)), 13); // 浪峰斷斷續續
    if (px < (lake ? 1 : 1.6) && broken > (lake ? 0.45 : 0.2)) idx[i] = !lake && broken > 1 - 0.06 * cfg.wind ? 6 : Math.min(5, tone + (lake ? 1 : 2));
    else if (!lake && px > span * 0.5 && px < span * 0.5 + 1 && tone >= 2) idx[i] = tone - 1;
  }
}

// 碎浪：每個循環兩道浪，從離岸約 8 px 處碎成白色浪花線，一路推到岸邊
const surfPhase = t => (t / LOOP * 2) % 1;
export function toneSurf(S, { t, idx }) {
  if (S.habitat !== 'coast') return;
  const { W, s, depth } = S, u = surfPhase(t), line = (1 - u) * 8 * s;
  for (const i of S.wIdx) {
    const d = depth[i], x = i % W;
    if (d > 10 * s) continue;
    const gap = hash(x >> 2, Math.floor(t * 2), 14) < 0.15; // 浪花線斷斷續續
    if (!gap && Math.abs(d - line) < 1.1) idx[i] = 6;
    else if (d > line && d < line + 3 * s && idx[i] < 5) idx[i] = 5;
  }
}
// 沖上沙灘的白色水膜：浪碎完後往岸上衝、再退回去
export function paintSwash(S, out, { t }) {
  if (S.habitat !== 'coast') return;
  const { W, H, s, distL, water, RAMP, hz } = S, u = surfPhase(t);
  if (u < 0.55) return;
  const reach = 6 * s * Math.sin(Math.PI * (u - 0.55) / 0.45), foam = RAMP[6], film = RAMP[4];
  for (let y = hz; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = distL[i];
    if (water[i] || d > reach + 1) continue;
    const edge = reach + (hash(x >> 1, 3, 15) - 0.5) * 2 * s;
    if (d > edge) continue;
    const c = d > edge - 1.2 ? foam : film, o = i * 4;
    out[o] = (out[o] + c[0] * 2) / 3; out[o + 1] = (out[o + 1] + c[1] * 2) / 3; out[o + 2] = (out[o + 2] + c[2] * 2) / 3;
  }
}
