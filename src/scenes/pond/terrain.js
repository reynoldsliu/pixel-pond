// 地面與天空：小徑、草地（或地面底圖）、土坡、岸泥、濕地；地平線以上的漸層天空、遠方林線、會飄的雲
import { WHITE, bayer, hash, mix, shade } from '../../core/color.js';
import { SKY_LOOP } from '../../core/config.js';
import { vnoise, vnoiseP } from '../../core/math.js';

const FLOWER = [[236, 206, 74], [120, 150, 232], [240, 238, 226]];

// 小徑（p）：一條從畫面邊緣彎進來的泥土路，避開水邊
function buildPath({ cfg, W, H, N, s, R, hz, GH, sea }) {
  const path = new Uint8Array(N);
  if (sea || !String(cfg.props).includes('p')) return path;
  const flip = R() < 0.5, P = [[W * 1.04, hz + GH * (0.35 + R() * 0.25)], [W * (0.72 + R() * 0.1), hz + GH * (0.12 + R() * 0.15)], [W * (0.6 + R() * 0.15), hz - 3]];
  const pw = 3.6 * s;
  for (let k = 0; k <= 200; k++) {
    const u = k / 200, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    let px = a * P[0][0] + b * P[1][0] + c * P[2][0]; const py = a * P[0][1] + b * P[1][1] + c * P[2][1];
    if (flip) px = W - 1 - px;
    const w = pw * (1 + 0.25 * Math.sin(u * 17));
    for (let y = Math.floor(py - w); y <= py + w; y++) for (let x = Math.floor(px - w); x <= px + w; x++)
      if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x - px, (y - py) * 1.3) <= w + (hash(x, y, 4) - 0.5) * 1.2) path[y * W + x] = 1;
  }
  return path;
}

// 地面：草（或底圖）、小徑、近岸泥土圈、對岸有層理的土坡；步驟 4：近岸與側岸的濕地壓到 82%
// art（選填）：{ ground: { w, h, px } }
export function buildTerrain(G, art) {
  const { cfg, eco, sea, W, H, N, s, st, C, hz, GH, cy, water, distL, topY, isFarLand, light, lit, face } = G;
  const beachW = GH * 0.28; // 沙灘寬度（離水線），再往內是長著濱草的沙丘
  const path = buildPath(G);
  const land = new Uint8ClampedArray(N * 3), kind = new Uint8Array(N); // kind 0 = 天空, 1 = 泥土, 2 = 草
  const bank = Math.max(1, Math.round(1.5 * s));
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0, h = hash(x, y, cfg.seed), L = light[i];
    let c;
    kind[i] = 2;
    if (sea && y >= hz) { // 沙灘：細沙紋 + 風吹出的波紋，靠近水線是深色濕沙，往內混進沙丘上的濱草
      const ripple = Math.sin((x * 0.15 + y * 0.9) / s + vnoise(x / (20 * s), y / (8 * s), cfg.seed + 11) * 6) > 0.7;
      c = lit(shade(C.dirt, 0.94 + h * 0.1 - (ripple ? 0.06 : 0)), Math.min(1, L));
      if (distL[i] > beachW) c = mix(c, lit(C.grass, L), Math.min(0.85, (distL[i] - beachW) / (beachW * 0.6)) * (vnoise(x / (9 * s), y / (5 * s), cfg.seed + 12) > 0.45 ? 1 : 0.4));
      if (distL[i] < 3 * s) c = shade(mix(c, C.deep, 0.15), 0.8);
      kind[i] = 1;
      land[i * 3] = c[0]; land[i * 3 + 1] = c[1]; land[i * 3 + 2] = c[2];
      continue;
    }
    if (art?.ground) { // 地面底圖：拉伸填滿畫面（最近鄰），一樣吃樹蔭
      const g = art.ground, o = (Math.floor(y * g.h / H) * g.w + Math.floor(x * g.w / W)) * 4;
      c = lit([g.px[o], g.px[o + 1], g.px[o + 2]], L);
    } else {
      // 草：大片的色塊變化（乾黃 / 深綠，橫向拉長 = 透視）→ 光 → 近處才有草葉筆觸、遠處只剩細碎抖動 → 成片的小花 → 遠方空氣霧化
      const u = Math.max(0, (y - hz) / GH), yy = (y - hz) / (0.5 + u);
      let g = mix(C.grass, [182, 170, 90], 0.55 * vnoise(x / (70 * s), yy / (22 * s), cfg.seed + 5));
      g = mix(g, [58, 100, 52], 0.7 * Math.max(0, vnoise(x / (35 * s), yy / (12 * s), cfg.seed + 6) - 0.4));
      // 草叢的斑駁：小尺度雜訊決定這一小塊是暗一階的草根陰影、還是被曬亮的草尖（尺度固定：隨 y 變會把雜訊格子斜切成放射條紋）
      const m = vnoise(x / (4.5 * s), y / (2.2 * s), cfg.seed + 8) + (bayer(x, y) - 0.5) * 0.2;
      const Lm = hz && y - hz < 3 * s ? Math.min(3, L + 1) : L; // 林線下緣的陰影
      c = m > 0.7 ? lit(g, Math.min(3, Lm + 1)) : m < 0.22 ? mix(lit(g, Lm), [246, 236, 160], 0.1) : lit(g, Lm);
      const blade = 0.07 * u, above = hash(x, y - 1, cfg.seed);
      if (h < blade) c = mix(c, [246, 240, 168], 0.12);
      else if (above < blade && u > 0.35) c = lit(g, Math.min(3, L + 1));
      else if (u < 0.35 && h > 0.9) c = mix(c, lit(g, Math.min(3, L + 1)), 0.5);
      if (eco.flowers && L < 2 && h > 0.988 && vnoise(x / (20 * s), y / (10 * s), cfg.seed + 7) > 0.6) c = FLOWER[(hash(x, y, 7) * 3) | 0];
      if (hz) c = mix(c, mix(C.sky, C.grass, 0.4), 0.45 * (1 - u) ** 3);
    }
    const fd = topY[x] - y;
    if (isFarLand(x, y) && fd <= face) { // 土坡：越靠水越暗、橫向層理、頂端草皮垂下
      c = shade(C.dirt, 0.42 + 0.12 * fd / face + h * 0.06);
      if ((y + ((hash(x >> 2, 0, cfg.seed) * 3) | 0)) % 3 === 0) c = shade(c, 0.82);
      if (fd >= face - 1 && (fd === face || hash(x, 1, cfg.seed) < 0.5)) c = lit(C.grass, Math.min(3, L + 1));
      kind[i] = 1;
    } else if (path[i] && distL[i] > 4 * s) {
      c = lit(mix(C.dirt, [190, 160, 110], 0.25), L);
      if (!path[i - 1] || !path[i + 1]) c = mix(c, lit(C.grass, L), 0.4); // 路緣混一點草色
      if (h > 0.9) c = shade(c, 1.15); else if (h < 0.08) c = shade(c, 0.85);
      kind[i] = 1;
    } else if (distL[i] <= bank && (y > cy || hash(x >> 1, y >> 1, 3) < 0.5)) {
      c = shade(lit(C.dirt, L), 0.85 + h * 0.15);
      kind[i] = 1;
    }
    if (st[4] && !water[i] && distL[i] < 1.5 && y > cy - 6) c = shade(c, 0.82); // 濕地：中線以上 6 行以下
    land[i * 3] = c[0]; land[i * 3 + 1] = c[1]; land[i * 3 + 2] = c[2];
  }
  return { path, land, kind, ...buildSky(G, land, kind) };
}

// 天空（地平線以上）：8 段漸層 + 抖動；兩層遠方林線由一棵棵圓頂/尖頂樹冠排成，越遠越淡（空氣透視）
// 雲是動態的（paintClouds），這裡先算好「可以出現雲的像素」與一份水平循環的雲圖
function buildSky({ cfg, W, H, N, s, R, C, hz, jitter, water, sea }, land, kind) {
  const skyOpen = new Uint8Array(N), cloudT = new Uint8Array(N);
  if (!(hz > 0)) return { skyOpen, cloudT };
  const top = mix(shade(C.sky, 0.8), [78, 140, 200], 0.4), low = mix(C.sky, WHITE, 0.45);
  for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, band = Math.min(7, Math.max(0, Math.floor((y / hz) ** 0.8 * 8 + (bayer(x, y) - 0.5) * 0.9)));
    const c = mix(top, low, band / 7);
    land[i * 3] = c[0]; land[i * 3 + 1] = c[1]; land[i * 3 + 2] = c[2]; kind[i] = 0; skyOpen[i] = 1;
  }
  const fogLow = mix(C.sky, WHITE, 0.3);
  if (!sea) for (const [hazeK, h0, h1, gap] of [[0.68, 3, 8, 2.5], [0.45, 5, 13, 3.5]]) { // 遠方林線（海邊是開闊海平線，沒有）
    const base = mix(C.foliage, fogLow, hazeK), Lc = mix(base, fogLow, 0.25), Dc = mix(shade(base, 0.85), [60, 90, 110], 0.15);
    for (let x0 = -8; x0 < W + 8; x0 += Math.max(2, jitter(0.6, 1.4) * gap * s)) {
      const hh = Math.min(hz * 0.75, jitter(h0, h1) * s), cone = R() < 0.35, w = hh * (cone ? 0.3 : jitter(0.35, 0.55)), cyc = hz - hh + w;
      for (let y = Math.floor(hz - hh); y <= hz; y++) {
        const half = cone ? w * (y - (hz - hh)) / hh * 1.6 : y < cyc ? Math.sqrt(Math.max(0, w * w - (y - cyc) ** 2)) : w;
        for (let x = Math.round(x0 - half); x <= Math.round(x0 + half); x++) {
          if (x < 0 || x >= W || y < 0 || y >= H || water[y * W + x]) continue;
          const i = y * W + x, f = (x - x0) / Math.max(1, half);
          if (y >= hz && kind[i]) continue;
          const c = f < -0.35 && y < hz - 1 ? Lc : f > 0.4 ? Dc : base;
          land[i * 3] = c[0]; land[i * 3 + 1] = c[1]; land[i * 3 + 2] = c[2]; skyOpen[i] = 0;
        }
      }
    }
  }
  // 雲：大塊 + 小塊雜訊疊出積雲輪廓，頂端受光、底部一條陰影
  const cells = Math.max(3, Math.round(W / (34 * s))), cw = W / cells;
  const cv = (x, y) => (vnoiseP(x / cw, y / (7 * s), cfg.seed + 9, cells) + (vnoiseP(x / (cw / 4), y / (3 * s), cfg.seed + 10, cells * 4) - 0.5) * 0.35)
    * (1 - Math.abs(y / hz - 0.32) * 2) - 0.52;
  for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++)
    if (cv(x, y) > 0) cloudT[y * W + x] = cv(x, y + 2 * s) <= 0 ? 1 : cv(x, y - 1.5 * s) <= 0 ? 3 : 2;
  return { skyOpen, cloudT };
}

// 雲：整數像素往右飄，SKY_LOOP 秒剛好飄過一個畫面寬
export function paintClouds(S, out, { time }) {
  if (!S.hz) return;
  const { W, cfg, C } = S;
  const tc = Math.round(((time * cfg.speed % SKY_LOOP) + SKY_LOOP) % SKY_LOOP * 1e3) / 1e3 % SKY_LOOP;
  const ox = Math.floor(tc / SKY_LOOP * W), CL = [null, mix(C.sky, [150, 165, 196], 0.35), mix(C.sky, WHITE, 0.72), mix(C.sky, WHITE, 0.94)];
  for (let y = 0; y < S.hz; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = S.cloudT[y * W + ((x - ox) % W + W) % W];
    if (k && S.skyOpen[i]) { const o = i * 4; out[o] = CL[k][0]; out[o + 1] = CL[k][1]; out[o + 2] = CL[k][2]; }
  }
}
