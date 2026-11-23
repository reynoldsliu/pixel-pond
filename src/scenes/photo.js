import { hex, lum, mix, rng, shade } from '../core/color.js';
import { COLOR_KEYS, LOOP, PHOTO_SKY_LOOP } from '../core/config.js';
import { phase, wrap } from '../core/math.js';
import { boxDown, medianCut, opaquePixels, quantize } from '../image/pixelate.js';
import { GLINT, RIPPLE } from './effects.js';

// ---------- 風景照 → 本產品風格的動態像素畫 ----------
// 照片裁成畫面比例、縮成像素畫；調色盤做「暗部偏藍綠、亮部偏暖黃」的色相偏移（和程式畫的樹、草一樣），
// 再找出水面：偏藍/青、不和頂端天空相連的區塊（下半部的一律算），水面套用教學的動態：逐行整像素錯開、亮點、漣漪。
// waterline：0 = 自動找水線；0–1 = 手動指定水面上緣在畫面高度的比例（灰暗的海和山影同色時，自動判斷會分不出來）
// raw：輸入已經是像素畫（例如「圖片像素化」的結果）→ 不再裁切、減色、修雜訊，保留透明
// clouds：天空裡的雲拆出來慢慢飄；sway：偏綠的植物隨風左右擺
export function buildPhotoScene(img, W, H, cfg, { colors = 20, dither = 1, water = 1, style = 0.35, waterline = 0, raw = false, clouds = true, sway = true } = {}) {
  const ar = W / H, cw = Math.min(img.width, img.height * ar), ch = cw / ar, N = W * H;
  const base = boxDown(img, W, H, [Math.round((img.width - cw) / 2), Math.round((img.height - ch) / 2), Math.round(cw), Math.round(ch)]);
  if (!raw) for (let i = 0; i < N; i++) base.data[i * 4 + 3] = 255;
  // 調色盤：中位切割 → 飽和度略升 → 暗部偏藍綠、亮部偏暖黃（和程式畫的素材同一套色相偏移）→ 往目前配色靠 style 的比例
  const theme = COLOR_KEYS.map(k => hex(cfg[k]));
  const pal = raw ? [] : medianCut(opaquePixels(base), colors).map(c => {
    const l = lum(c) / 255, g = (c[0] + c[1] + c[2]) / 3;
    let v = mix(mix(c.map(u => g + (u - g) * 1.15), [18, 40, 58], Math.max(0, 0.45 - l) * 0.5), [250, 238, 170], Math.max(0, l - 0.6) * 0.3);
    const near = theme.reduce((a, q) => ((q[0] - v[0]) ** 2 + (q[1] - v[1]) ** 2 + (q[2] - v[2]) ** 2 < (a[0] - v[0]) ** 2 + (a[1] - v[1]) ** 2 + (a[2] - v[2]) ** 2 ? q : a));
    v = mix(v, shade(near, Math.min(1.6, Math.max(0.5, (lum(v) + 8) / (lum(near) + 8)))), style); // 只借配色的色相，保留原本明暗
    return v.map(u => Math.max(0, Math.min(255, Math.round(u))));
  });
  if (!raw) quantize(base, pal, dither ? 56 / Math.sqrt(pal.length) : 0);
  // 清掉照片雜訊：孤立的單一像素換成周圍最多的顏色，留下像素畫那種乾淨的色塊
  const d = base.data, key = i => (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2], keys = Uint32Array.from({ length: N }, (_, i) => key(i));
  if (!raw) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, nb = [i - 1, i + 1, i - W, i + W];
    if (nb.some(j => keys[j] === keys[i])) continue;
    const cnt = new Map(); for (const j of nb) cnt.set(keys[j], (cnt.get(keys[j]) || 0) + 1);
    const [best, n] = [...cnt].sort((a, b) => b[1] - a[1])[0];
    if (n >= 2) { const j = nb.find(q => keys[q] === best); d.set(d.subarray(j * 4, j * 4 + 3), i * 4); }
  }
  // 水面偵測：候選 = 偏藍/青的顏色，或「畫面最下方 12% 常見、又不偏暖」的顏色（灰暗的海、陰天的湖）；
  // 從最上排沿候選淹到的是天空；剩下的候選連通塊只留重心在畫面下半、或碰到底邊的
  const sens = 12 / Math.max(0.2, water), cand = new Uint8Array(N), bottomCount = new Map(), b0 = Math.floor(H * 0.88);
  for (let i = b0 * W; i < N; i++) bottomCount.set(keys[i], (bottomCount.get(keys[i]) || 0) + 1);
  const bottomSet = new Set(); // 底部最常見、合計佔七成的顏色（不偏暖的才算）
  { let acc = 0; for (const [k, n] of [...bottomCount].sort((a, b) => b[1] - a[1])) { if (acc > (N - b0 * W) * 0.7) break; acc += n; if ((k & 255) >= (k >> 16) - 6) bottomSet.add(k); } }
  // 「底部常見色」只在水線以下算：從底邊往上逐行看，這些顏色佔整行六成以上才算還在水面（避免山的陰影同色被當成水）
  let waterTop = waterline > 0 ? Math.round(H * waterline) : H;
  if (!(waterline > 0)) for (let y = H - 1; y >= 0; y--) { let n = 0; for (let x = 0; x < W; x++) if (bottomSet.has(keys[y * W + x])) n++; if (n < W * 0.5) break; waterTop = y; }
  for (let i = 0; i < N; i++) {
    const [r, g, b] = d.subarray(i * 4, i * 4 + 3);
    cand[i] = water > 0 && d[i * 4 + 3] > 0 && ((b > r + sens && (g + b) / 2 > r + sens * 0.6 && lum([r, g, b]) > 30) || (i >= waterTop * W && (waterline > 0 ? r < b + 30 : bottomSet.has(keys[i])))) ? 1 : 0; // 手動水線以下：不偏暖（不是沙、岩石）的都算水
  }
  const flood = (seedOk, ok) => {
    const seen = new Int32Array(N).fill(-1), comps = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (!ok(s0) || seen[s0] >= 0 || !seedOk(s0)) continue;
      const id = comps.length, st = [s0], c = { n: 0, ysum: 0, bottom: false, top: false, px: [] }; seen[s0] = id;
      while (st.length) {
        const i = st.pop(), x = i % W, y = (i / W) | 0;
        c.n++; c.ysum += y; c.px.push(i); if (y === H - 1) c.bottom = true; if (y === 0) c.top = true;
        for (const j of [x ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && seen[j] < 0 && ok(j)) { seen[j] = id; st.push(j); }
      }
      comps.push(c);
    }
    return comps;
  };
  let wm = new Uint8Array(N);
  for (const c of flood(() => true, i => cand[i])) {
    const cyM = c.ysum / c.n / H;
    if (c.n < N * 0.003 || (!(waterline > 0) && ((c.top && cyM < 0.6) || (cyM < 0.5 && !c.bottom)))) continue; // 太小、或是天空
    if (waterline > 0 && cyM < waterline) continue;
    for (const i of c.px) wm[i] = 1;
  }
  for (let pass = 0; pass < 2; pass++) wm = Uint8Array.from(wm, (v, i) => { // 多數決修邊
    const x = i % W; let n = 0;
    for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1) n += wm[j];
    return n >= 5 ? 1 : n <= 2 ? 0 : v;
  });
  const wIdx = []; for (let i = 0; i < N; i++) if (wm[i]) wIdx.push(i);
  const bright = wIdx.map(i => d.subarray(i * 4, i * 4 + 3)).reduce((a, c) => (lum(c) > lum(a) ? c : a), [90, 120, 130]);
  const hi = mix(bright, [255, 255, 240], 0.55).map(Math.round), R = rng(cfg.seed);
  const spot = () => wIdx.length ? wIdx[(R() * wIdx.length) | 0] : -1;
  const glints = [], drops = [];
  for (let k = 0; k < Math.round(cfg.sparkles * 33 * Math.min(1, wIdx.length / 6000)); k++) { const i = spot(); if (i >= 0) glints.push({ x: i % W, y: (i / W) | 0, t0: R() * LOOP }); }
  for (let k = 0; k < Math.round(cfg.ripples * 2 * Math.min(2, wIdx.length / 4000 + 0.5)); k++) { const i = spot(); if (i >= 0) drops.push({ x: i % W, y: (i / W) | 0, t0: R() * LOOP }); }
  // 天空：從最上排沿「偏藍或很亮」的像素淹過去（水面、樹、山都擋住）。每排最常見的顏色當天空底色，
  // 和它差很多的就是雲：雲從底圖抹掉，另存成鏡像接起的 2 倍寬雲圖，播放時整片往右平移，只畫在天空像素上（雲會從樹後面飄過）
  const L = i => lum(d.subarray(i * 4, i * 4 + 3)), sky = new Uint8Array(N);
  const skyLike = i => d[i * 4 + 3] > 0 && !wm[i] && i < N * 0.75 && ((d[i * 4 + 2] >= d[i * 4] - 10 && L(i) > 90) || L(i) > 165);
  for (const c of flood(i => i < W, skyLike)) for (const i of c.px) sky[i] = 1;
  let skyIdx = []; for (let i = 0; i < N; i++) if (sky[i]) skyIdx.push(i);
  let cloud = null;
  if (clouds && skyIdx.length > N * 0.03) {
    const rowBg = [], isCloud = new Uint8Array(N); let nc = 0;
    for (let y = 0; y < H; y++) {
      const cnt = new Map(); // 上下各 3 排一起算，抖色造成的兩色交錯才不會被當成雲
      for (let yy = Math.max(0, y - 3); yy <= Math.min(H - 1, y + 3); yy++) for (let x = 0; x < W; x++) if (sky[yy * W + x]) cnt.set(keys[yy * W + x], (cnt.get(keys[yy * W + x]) || 0) + 1);
      if (!cnt.size) continue;
      const k = [...cnt].sort((a, b) => b[1] - a[1])[0][0], bg = [k >> 16, (k >> 8) & 255, k & 255]; rowBg[y] = bg;
      for (let x = 0; x < W; x++) { const i = y * W + x; if (sky[i] && Math.hypot(d[i * 4] - bg[0], d[i * 4 + 1] - bg[1], d[i * 4 + 2] - bg[2]) > 40) { isCloud[i] = 1; nc++; } }
    }
    const clean = nc < skyIdx.length * 0.45; // 和底色不同的太多 = 其實不是乾淨的天空（亮的岩壁、陰天），不拆
    // 下緣貼著地面的「雲」其實是遠山、霧中的島：不飄，也從天空拿掉，免得飄過來的雲蓋住它
    for (const c of flood(() => true, i => isCloud[i])) if (c.px.some(i => i + W < N && !sky[i + W])) { for (const i of c.px) { isCloud[i] = 0; sky[i] = 0; } nc -= c.n; }
    skyIdx = skyIdx.filter(i => sky[i]);
    if (clean && nc > skyIdx.length * 0.02) {
      cloud = new Int32Array(2 * W * H).fill(-1); // 每格存 RGB（-1 = 沒有雲）
      for (let y = 0; y < H; y++) for (let u = 0; u < 2 * W; u++) { const i = y * W + (u < W ? u : 2 * W - 1 - u); if (isCloud[i]) cloud[y * 2 * W + u] = keys[i]; }
      for (const i of skyIdx) if (isCloud[i]) d.set(rowBg[(i / W) | 0], i * 4);
    }
  }
  // 植物：偏綠、不是水也不是天空
  const veg = []; if (sway) for (let i = 0; i < N; i++) if (d[i * 4 + 3] > 0 && !wm[i] && !sky[i] && d[i * 4 + 1] > d[i * 4] + 8 && d[i * 4 + 1] > d[i * 4 + 2]) veg.push(i);
  const vegM = new Uint8Array(N); for (const i of veg) vegM[i] = 1;
  return { type: 'photo', photo: true, cfg, W, H, hz: 0, base: d, water: wm, wIdx, hi, mid: mix(bright, hi, 0.4).map(Math.round), glints, drops, palette: pal,
    skyIdx: cloud ? skyIdx : [], cloud, veg, vegM, period: cloud ? PHOTO_SKY_LOOP : LOOP };
}
export function renderPhoto(S, out, time) {
  const { W, H, cfg, water, base } = S;
  const t = (Math.round(wrap(time * cfg.speed) * 1e6) / 1e6) % LOOP;
  out.set(base);
  if (S.cloud) { // 雲往右飄，PHOTO_SKY_LOOP 秒飄完 2W（一圈）
    const tc = ((time * cfg.speed) % PHOTO_SKY_LOOP + PHOTO_SKY_LOOP) % PHOTO_SKY_LOOP, ox = Math.floor(tc / PHOTO_SKY_LOOP * 2 * W), W2 = 2 * W;
    for (const i of S.skyIdx) {
      const x = i % W, y = (i / W) | 0, k = S.cloud[y * W2 + (((x - ox) % W2) + W2) % W2];
      if (k >= 0) { const o = i * 4; out[o] = k >> 16; out[o + 1] = (k >> 8) & 255; out[o + 2] = k & 255; }
    }
  }
  for (const i of S.veg) { // 植物隨風擺：逐像素往左右取樣，只從植物像素取，不會把天空拉進樹裡
    const x = i % W, y = (i / W) | 0, dx = Math.round(Math.sin(phase(t, 1) + y * 0.15 + x * 0.03) * cfg.wind * 0.8), sx = x - dx;
    if (dx && sx >= 0 && sx < W && S.vegM[y * W + sx]) out.set(base.subarray((y * W + sx) * 4, (y * W + sx) * 4 + 3), i * 4);
  }
  const pset = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H && water[y * W + x]) { const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; } };
  // 水面逐行整像素錯開（照片裡原本的倒影會跟著晃），只從水面像素取樣，岸邊不會被拉進水裡
  for (const i of S.wIdx) {
    const x = i % W, y = (i / W) | 0, dx = Math.round(cfg.wobble * Math.sin(y * 0.75 - phase(t, 2)));
    const sx = x + dx;
    if (dx && sx >= 0 && sx < W && water[y * W + sx]) out.set(base.subarray((y * W + sx) * 4, (y * W + sx) * 4 + 3), i * 4);
  }
  for (const g of S.glints) {
    const u = wrap(t - g.t0) / 0.6;
    if (u < 1) for (const [dx, tone] of GLINT.find(([until]) => u < until)[1]) pset(g.x + dx, g.y, tone === 6 ? S.hi : S.mid);
  }
  for (const d of S.drops) {
    const k = Math.floor(wrap(t - d.t0) / 0.2);
    if (k < RIPPLE.length) for (const [dx, dy] of RIPPLE[k]) pset(d.x + dx, d.y + dy, k < 3 ? S.hi : S.mid);
  }
}
