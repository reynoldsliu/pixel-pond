import { bayer, lum } from '../core/color.js';

// ---------- 圖片工具：像素化、去背、風景照轉換 ----------
// 依面積平均縮到 w×h（透明度先乘進顏色，邊緣不發黑）；crop = [x, y, cw, ch] 只取原圖的一塊；mask(x, y) 回傳 0/1 時乘進透明度
export function boxDown({ width: W0, height: H0, data }, w, h, crop = [0, 0, W0, H0], mask) {
  const [cx, cy, cw, ch] = crop, out = new Uint8ClampedArray(w * h * 4), alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xa = cx + Math.floor(x * cw / w), xb = Math.max(xa + 1, cx + Math.floor((x + 1) * cw / w));
    const ya = cy + Math.floor(y * ch / h), yb = Math.max(ya + 1, cy + Math.floor((y + 1) * ch / h));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) {
      const o = (yy * W0 + xx) * 4, al = data[o + 3] * (mask ? mask(xx, yy) : 1);
      r += data[o] * al; g += data[o + 1] * al; b += data[o + 2] * al; a += al; n++;
    }
    const o = (y * w + x) * 4;
    if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
    alpha[y * w + x] = a / n;
    out[o + 3] = a / n > 127 ? 255 : 0;
  }
  return { width: w, height: h, data: out, alpha };
}
// 中位切割：每次切開「範圍 × 像素數」最大的箱子，沿最寬的色版從中位數切；回傳每箱平均色
export function medianCut(px, colors) {
  const range = box => { // 不用 Math.max(...)：大圖有十幾萬個像素，展開參數會爆堆疊
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of box) for (let ch = 0; ch < 3; ch++) { if (p[ch] < lo[ch]) lo[ch] = p[ch]; if (p[ch] > hi[ch]) hi[ch] = p[ch]; }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };
  const boxes = px.length ? [px] : [];
  while (boxes.length < colors) {
    let best = -1, score = 0;
    boxes.forEach((bx, k) => { const v = Math.max(...range(bx)) * bx.length; if (bx.length > 1 && v > score) { score = v; best = k; } });
    if (best < 0) break;
    const bx = boxes[best], rg = range(bx), ch = rg.indexOf(Math.max(...rg));
    bx.sort((p, q) => p[ch] - q[ch]);
    boxes.splice(best, 1, bx.slice(0, bx.length >> 1), bx.slice(bx.length >> 1));
  }
  return boxes.map(bx => [0, 1, 2].map(ch => Math.round(bx.reduce((n, p) => n + p[ch], 0) / bx.length)));
}
// 每個不透明像素換成調色盤裡最近的一色；spread > 0 時先加 4×4 Bayer 抖動
export function quantize(img, pal, spread) {
  const { width: w, height: h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (!data[o + 3] || !pal.length) continue;
    const d = (bayer(i % w, (i / w) | 0) - 0.5) * spread, c = [data[o] + d, data[o + 1] + d, data[o + 2] + d];
    let best = pal[0], bd = 1e9;
    for (const q of pal) { const v = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (v < bd) { bd = v; best = q; } }
    data[o] = best[0]; data[o + 1] = best[1]; data[o + 2] = best[2];
  }
  return img;
}
export const opaquePixels = ({ width: w, height: h, data }) => {
  const px = [];
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3]) px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  return px;
};

// 去背（支援複雜背景，GrabCut 的簡化版，不用 AI 模型、離線可跑）：
// 1. 縮到最長邊 160 px 計算；畫面外框 margin 以內確定是背景，框內「可能是主體」，先標「最不像背景」的一半
// 2. 主體、背景各用 5 群高斯（k-means 初始化）描述顏色分佈 → 每個像素算屬於哪邊的代價，加一點「越靠中央越像主體」
// 3. 相鄰像素顏色越接近越該同一邊（對比權重）；用 ICM 逐點取代價最小的一邊，重估顏色模型，反覆 6 輪
// 4. 只留夠大的主體連通塊、補掉主體內部的洞
// ponytail: ICM 是局部最佳解，不是 GrabCut 原版的 graph cut 全域最小割；邊緣不夠準時再換 max-flow
// 實測（樹形主體貼在 3 張風景照上）：margin 0.12–0.15 時 IoU 約 0.8–0.95；主體貼近畫面邊緣時把 margin 調小
export function segment(img, { margin = 0.12, rounds = 6, prior = 6, lam = 3 } = {}) {
  const k = Math.min(1, 160 / Math.max(img.width, img.height)), w = Math.max(8, Math.round(img.width * k)), h = Math.max(8, Math.round(img.height * k));
  const small = boxDown(img, w, h), N = w * h, Z = [];
  for (let i = 0; i < N; i++) Z.push([small.data[i * 4], small.data[i * 4 + 1], small.data[i * 4 + 2]]);
  const mx = Math.round(w * margin), my = Math.round(h * margin);
  const fixedBg = i => { const x = i % w, y = (i / w) | 0; return x < mx || y < my || x >= w - mx || y >= h - my || !small.data[i * 4 + 3]; };
  const lab = new Uint8Array(N);
  for (let i = 0; i < N; i++) lab[i] = fixedBg(i) ? 0 : 1;
  const fit = which => { // k-means → 每群 { 權重, 平均, 對角變異數 }
    const pts = Z.filter((_, i) => lab[i] === which);
    if (pts.length < 5) return [{ wt: 1, m: [128, 128, 128], v: [3000, 3000, 3000] }];
    pts.sort((a, b) => lum(a) - lum(b));
    let mu = Array.from({ length: 5 }, (_, q) => pts[Math.floor((q + 0.5) / 5 * pts.length)].slice());
    let asg = new Uint8Array(pts.length);
    for (let it = 0; it < 6; it++) {
      pts.forEach((p, n) => { let bd = 1e9; mu.forEach((m, q) => { const d = (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2; if (d < bd) { bd = d; asg[n] = q; } }); });
      mu = mu.map((m, q) => { const g = pts.filter((_, n) => asg[n] === q); return g.length ? [0, 1, 2].map(c => g.reduce((s2, p) => s2 + p[c], 0) / g.length) : m; });
    }
    return mu.map((m, q) => {
      const g = pts.filter((_, n) => asg[n] === q);
      return { wt: Math.max(1e-3, g.length / pts.length), m, v: [0, 1, 2].map(c => Math.max(60, g.reduce((s2, p) => s2 + (p[c] - m[c]) ** 2, 0) / Math.max(1, g.length))) };
    });
  };
  const nll = (G, p) => {
    let s2 = 0;
    for (const { wt, m, v } of G) s2 += wt * Math.exp(-0.5 * ((p[0] - m[0]) ** 2 / v[0] + (p[1] - m[1]) ** 2 / v[1] + (p[2] - m[2]) ** 2 / v[2])) / Math.sqrt(v[0] * v[1] * v[2]);
    return -Math.log(s2 + 1e-30);
  };
  // 相鄰對比權重（β = 1 / 2⟨‖Δz‖²⟩）
  let mean = 0, cnt = 0;
  const dz = (i, j) => (Z[i][0] - Z[j][0]) ** 2 + (Z[i][1] - Z[j][1]) ** 2 + (Z[i][2] - Z[j][2]) ** 2;
  for (let i = 0; i < N; i++) { if (i % w < w - 1) { mean += dz(i, i + 1); cnt++; } if (i + w < N) { mean += dz(i, i + w); cnt++; } }
  const beta = 1 / (2 * Math.max(1, mean / cnt));
  const nb = i => { const x = i % w, r = []; if (x > 0) r.push(i - 1); if (x < w - 1) r.push(i + 1); if (i >= w) r.push(i - w); if (i + w < N) r.push(i + w); return r; };
  { // 起手：先只用外框學背景色，框內「最不像背景」的一半才標成主體，主體的顏色模型才不會一開始就混進背景
    const B = fit(0), inner = [];
    for (let i = 0; i < N; i++) if (!fixedBg(i)) inner.push([nll(B, Z[i]), i]);
    inner.sort((a, b) => b[0] - a[0]);
    inner.forEach(([, i], n) => { lab[i] = n < inner.length * 0.5 ? 1 : 0; });
  }
  for (let round = 0; round < rounds; round++) {
    const F = fit(1), B = fit(0), dF = new Float32Array(N), dB = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i % w) / w - 0.5, y = ((i / w) | 0) / h - 0.5;
      dF[i] = nll(F, Z[i]) + (x * x + y * y) * prior; dB[i] = nll(B, Z[i]);
    }
    for (let sweep = 0; sweep < 5; sweep++) for (let i = 0; i < N; i++) {
      if (fixedBg(i)) continue;
      let cF = dF[i], cB = dB[i];
      for (const j of nb(i)) { const e = lam * Math.exp(-beta * dz(i, j)); if (lab[j]) cB += e; else cF += e; }
      lab[i] = cF < cB ? 1 : 0;
    }
  }
  // 連通塊整理：留下 ≥ 最大塊 15% 的主體；沒碰到外框的背景塊（主體內的洞）補成主體
  const comps = (val) => {
    const id = new Int32Array(N).fill(-1), sizes = [], edge = [];
    for (let i = 0; i < N; i++) {
      if (lab[i] !== val || id[i] >= 0) continue;
      const c = sizes.length, st = [i]; let n = 0, touches = false; id[i] = c;
      while (st.length) { const q = st.pop(); n++; const x = q % w, y = (q / w) | 0; if (!x || !y || x === w - 1 || y === h - 1) touches = true; for (const j of nb(q)) if (lab[j] === val && id[j] < 0) { id[j] = c; st.push(j); } }
      sizes.push(n); edge.push(touches);
    }
    return { id, sizes, edge };
  };
  const fg = comps(1), big = Math.max(0, ...fg.sizes);
  for (let i = 0; i < N; i++) if (lab[i] && fg.sizes[fg.id[i]] < big * 0.15) lab[i] = 0;
  const bg = comps(0);
  for (let i = 0; i < N; i++) if (!lab[i] && !bg.edge[bg.id[i]]) lab[i] = 1;
  return { width: w, height: h, mask: lab };
}

// 圖片像素化：縮小 →（選填）去背 → 中位切割調色盤 →（選填）Bayer 抖動
export function pixelate(img, { width = 64, colors = 16, dither = 1, removeBg = 0, margin = 0.12 } = {}) {
  const w = Math.max(1, Math.min(img.width, Math.round(width))), h = Math.max(1, Math.round(img.height * w / img.width));
  let mask;
  if (removeBg) { const m = segment(img, { margin }); mask = (x, y) => m.mask[Math.floor(y * m.height / img.height) * m.width + Math.floor(x * m.width / img.width)]; }
  const out = boxDown(img, w, h, undefined, mask), pal = medianCut(opaquePixels(out), colors);
  quantize(out, pal, dither ? 96 / Math.sqrt(Math.max(2, pal.length)) : 0);
  return { width: w, height: h, data: out.data, palette: pal };
}
