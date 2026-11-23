import { hash } from './color.js';
import { LOOP } from './config.js';

// 時間循環、距離場、雜訊
export const TAU = Math.PI * 2;
export const phase = (t, cycles) => TAU * cycles * t / LOOP; // cycles 為整數 → 循環沒有接縫
export const wrap = u => ((u % LOOP) + LOOP) % LOOP;
// mask===1 的像素到最近 mask===0 像素的距離（兩趟 chamfer，近似歐氏距離）
export function edt(mask, W, H) {
  const d = new Float32Array(W * H), D = Math.SQRT2;
  for (let i = 0; i < W * H; i++) d[i] = mask[i] ? 1e9 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, d[i - W] + 1);
      if (x > 0) v = Math.min(v, d[i - W - 1] + D);
      if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
    }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < H - 1) {
      v = Math.min(v, d[i + W] + 1);
      if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
      if (x > 0) v = Math.min(v, d[i + W - 1] + D);
    }
    d[i] = v;
  }
  return d;
}
// 兩次方框模糊 ≈ 高斯，再取 0.5 門檻：色帶順著岸形，不跟著每個小凹口走
export function smoothMask(m, W, H, r) {
  let a = Float32Array.from(m);
  const box = (src, dx, dy) => {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(W - 1, Math.max(0, x + k * dx)), yy = Math.min(H - 1, Math.max(0, y + k * dy));
        sum += src[yy * W + xx];
      }
      o[y * W + x] = sum / (2 * r + 1);
    }
    return o;
  };
  for (let p = 0; p < 2; p++) a = box(box(a, 1, 0), 0, 1);
  return Uint8Array.from(a, v => (v > 0.5 ? 1 : 0));
}

// 平滑的值雜訊（0–1），拿來做樹蔭的大塊明暗
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, z), b = hash(xi + 1, yi, z), c = hash(xi, yi + 1, z), d = hash(xi + 1, yi + 1, z);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// 水平方向以 px 格為週期的值雜訊：雲平移一整個畫面寬後剛好接回來
export function vnoiseP(x, y, z, px) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const m = v => ((v % px) + px) % px;
  const a = hash(m(xi), yi, z), b = hash(m(xi + 1), yi, z), c = hash(m(xi), yi + 1, z), d = hash(m(xi + 1), yi + 1, z);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
