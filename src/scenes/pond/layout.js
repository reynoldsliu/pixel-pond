// 版面：池塘形狀、深度與離岸距離、透視、光照。其他圖層都在這個基礎上蓋。
// 回傳的 G 會一路往下傳給各圖層的 build，最後就是場景本身（各圖層把自己的資料加進去）。
import { bayer, hex, mix, rng, shade } from '../../core/color.js';
import { COLOR_KEYS } from '../../core/config.js';
import { edt, smoothMask, vnoise } from '../../core/math.js';
import { makeRamp } from '../effects.js';
import { ecosystem } from '../../core/ecology.js';

export function buildLayout(cfg, W, H) {
  const N = W * H, s = W / 320, R = rng(cfg.seed), st = {};
  for (const ch of String(cfg.steps)) st[ch] = true;
  const C = {};
  for (const k of COLOR_KEYS) C[k] = hex(cfg[k]);
  const RAMP = makeRamp(C);

  // 池塘形狀：帶兩組正弦擾動的橢圓
  // 位置、大小、扁平度（= 視角）都依種子隨機；大一點的池塘會被畫面左右或下緣裁掉，像範例那樣只拍到一部分
  // 有天空時地面只佔地平線以下（GH 行），池塘也跟著變扁 = 視角更斜
  // 水域類型：pond 池塘（整個看得到）、lake 大型湖泊（對岸很遠、左右和近岸都超出畫面）、coast 海岸（海平線到沙灘）、ocean 海洋（只有海）
  const eco = cfg.eco || ecosystem(cfg), habitat = eco.habitat, sea = habitat === 'coast' || habitat === 'ocean';
  const hz = Math.round(H * Math.min(0.45, Math.max(0, cfg.horizon ?? 0))), GH = H - hz;
  const u0 = R(), u1 = R(), u2 = R(), u3 = R();
  let cx = W * (0.3 + u0 * 0.4), cy = hz + GH * (0.5 + u1 * 0.18), rx = W * (0.3 + u2 * 0.16) * cfg.pond, ry = GH * (0.25 + u3 * 0.12) * cfg.pond;
  if (habitat === 'lake') { // 對岸在畫面上方一成多，湖面寬到超出畫面
    const far = hz + GH * (0.1 + u1 * 0.12);
    cx = W * (0.35 + u0 * 0.3); rx = W * (0.8 + u2 * 0.4) * (0.6 + cfg.pond * 0.4); ry = GH * (0.7 + u3 * 0.25); cy = far + ry;
  } else if (sea) { cx = W / 2; cy = hz; rx = W * 0.6; ry = GH * 0.8; } // 海：「對岸」就是海平線
  // 透視：越下面（越近）越大。地平線 0.5 倍、畫面底端 1.25 倍，畫面外的前景再大一點
  const persp = y => 0.5 + 0.75 * Math.min(1.3, Math.max(0, (y - hz) / GH));
  // 樹的大小照現實分佈：兩成是小樹苗（跟草叢差不多）、六成一般、一成半是大樹（樹冠能和池塘比）
  const treeSize = () => { const u = R(); return u < 0.2 ? 0.3 + R() * 0.25 : u < 0.85 ? 0.75 + R() * 0.5 : 1.4 + R() * 0.6; };
  const jitter = (a, b) => a + R() * (b - a);
  const kk = (2 * ry) / 60; // 教學的數字以「前後約 60 px 的池塘」為準，依池塘大小縮放
  const p1 = R() * 7, p2 = R() * 7, water = new Uint8Array(N);
  // 海岸線：海平線往下 pond 比例的位置，兩組正弦讓它彎曲（海灣、岬角）
  const shore = x => hz + GH * (0.3 + 0.4 * cfg.pond + 0.1 * Math.sin(x / W * 5 + p1) + 0.04 * Math.sin(x / W * 14 + p2));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (sea) { water[y * W + x] = y >= hz && (habitat === 'ocean' || y < shore(x)) ? 1 : 0; continue; }
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
    const e = 1 + 0.08 * Math.sin(3 * a + p1) + 0.05 * Math.sin(7 * a + p2);
    water[y * W + x] = dx * dx + dy * dy < e * e ? 1 : 0;
  }
  // 離岸距離：海的海平線不是岸（把天空當成水算），否則遠方海面會被當成淺水
  const deepMask = sea ? Uint8Array.from(water, (v, i) => v || i < hz * W ? 1 : 0) : water;
  const depth = edt(smoothMask(deepMask, W, H, Math.max(1, Math.round(2 * s))), W, H);
  const distW = edt(water, W, H), distL = edt(Uint8Array.from(water, v => 1 - v), W, H);
  const topY = new Int16Array(W).fill(-1); // 每欄對岸水線
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (water[y * W + x]) { topY[x] = y; break; }
  const rowOf = i => (i / W | 0) - topY[i % W]; // 在對岸水線下方第幾行
  const isFarLand = (x, y) => topY[x] >= 0 && y < topY[x] && y < cy;
  const isFarWater = i => (i / W | 0) < cy && rowOf(i) <= 4;

  // 光：池塘周圍是一片受光的空地，往外是樹冠投下的大塊陰影（值雜訊），量化成 4 階（0 受光 … 3 深蔭），交界用 Bayer 抖動
  const light = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0, dx = (x - cx) / (rx * 1.5), dy = (y - cy) / (ry * 1.75);
    const v = 1.15 - Math.hypot(dx, dy) + (vnoise(x / (44 * s), y / (24 * s), cfg.seed) - 0.5) * 0.9 // 縱向壓扁 = 地面透視
      + (vnoise(x / (15 * s), y / (8 * s), cfg.seed + 1) - 0.5) * 0.3 + (bayer(x, y) - 0.5) * 0.05;
    light[i] = sea ? 0 : v > 0.45 ? 0 : v > 0.05 ? 1 : v > -0.4 ? 2 : 3; // 海邊開闊，沒有大片樹蔭
  }
  // 樹蔭只暗一兩成、帶一點冷色，不然外圈看起來像晚上
  const lit = (c, l) => [mix(c, [255, 236, 150], 0.16), c, mix(shade(c, 0.84), [60, 110, 110], 0.14), mix(shade(c, 0.7), [44, 92, 100], 0.22)][l];

  return {
    cfg, eco, habitat, sea, W, H, N, s, R, st, C, RAMP, hz, GH, cx, cy, rx, ry, kk, persp, treeSize, jitter,
    water, depth, distW, distL, topY, rowOf, isFarLand, isFarWater, light, lit,
    face: Math.max(3, Math.round(4 * s)), // 對岸土坡的高度
  };
}
