import { hex, mix, shade } from '../core/color.js';
import { PALETTES } from '../core/config.js';

// 水面色階與共用動畫畫格（漣漪、亮點、火焰）
// 10 色色階，由使用者的深水/淺水/天空色推出：0–6 水（暗→亮）、7 泥上淺水、8 倒映的岸泥、9 倒映的岸草
// 範例的水是低彩度的青綠：亮部只往天空色走 2 成，最亮的 6 號才是天空色本身（給漣漪與亮點用）
// 教學實測的 10 色（森林配色時原樣使用）；其他配色由深水/淺水/天空色推出同樣的關係
export const SPEC_RAMP = ['#1d3a44', '#24505a', '#2e6468', '#3f8484', '#5d9fa6', '#6fb3a8', '#c4ece2', '#5a9384', '#2c3b36', '#2d5246'];
export function makeRamp(C) {
  const F = PALETTES.forest;
  if ([C.deep, C.shallow, C.sky].every((c, k) => c.join() === hex([F.deep, F.shallow, F.sky][k]).join())) return SPEC_RAMP.map(hex);
  return [
    shade(C.deep, 0.75), C.deep, mix(C.deep, C.shallow, 0.3), mix(C.deep, C.shallow, 0.6), C.shallow,
    mix(C.shallow, C.sky, 0.25), C.sky,
    shade(mix(C.shallow, C.grass, 0.35), 0.9),
    mix(shade(C.dirt, 0.5), C.deep, 0.3), mix(shade(C.grass, 0.45), C.deep, 0.35),
  ].map(c => c.map(Math.round));
}

// 漣漪 5 格（教學數字）：半徑 (1,0)→(8,4)，最後兩格只留 |dy| ≥ ry/2 的上下弧
export const RIPPLE = [[1, 0], [2, 1], [4, 2], [6, 3], [8, 4]].map(([rx, ry], k) => {
  const pts = new Map();
  for (let a = 0; a < 360; a += 2) {
    const dx = Math.round(Math.cos(a * Math.PI / 180) * rx), dy = Math.round(Math.sin(a * Math.PI / 180) * ry);
    if (k < 3 || Math.abs(dy) >= ry / 2) pts.set(dx + ',' + dy, [dx, dy]);
  }
  return [...pts.values()];
});
// 亮點 0.6 秒的畫格：1 px → 3 px → 5 px → 裂開
export const GLINT = [
  [0.15, [[0, 6]]],
  [0.30, [[-1, 5], [0, 6], [1, 5]]],
  [0.65, [[-2, 5], [-1, 6], [0, 6], [1, 6], [2, 5]]],
  [0.85, [[-2, 5], [-1, 6], [1, 6], [2, 5]]],
  [1.00, [[-2, 5], [2, 5]]],
];
export const FIRE = [[255, 250, 214], [255, 226, 128], [252, 176, 62], [232, 108, 38], [160, 54, 30]]; // 火心白黃 → 外焰暗紅
