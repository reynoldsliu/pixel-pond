// 池塘場景：依圖層組裝。
// build：每個圖層讀前面圖層的資料、回傳自己的資料，合併成場景 S。
//   順序固定，因為全部共用同一個種子亂數 R：換順序 = 換一張畫。
// render：先在「色號」階段疊水面效果（idx），一次換成顏色後，再依前後順序疊上不透明的東西。
//   新增效果 = 寫一個 pass 放進 TONE_PASSES 或 PAINT_PASSES，不用改其他圖層。
import { LOOP, SKY_LOOP } from '../../core/config.js';
import { wrap } from '../../core/math.js';
import { buildLayout } from './layout.js';
import { buildTerrain, paintClouds } from './terrain.js';
import { buildObjects, paintObjects } from './objects.js';
import { buildWaterTones, buildWaterDetails, toneBankReflection, toneTreeReflection, toneShore, toneSurfaceLife, paintWaterline, paintLeaves, toneSwell, toneSurf, paintSwash } from './water.js';
import { buildLife, toneLife, paintLife } from './life.js';
import { buildBirds, toneBirds, paintBirds } from './birds.js';

// art（選填）：{ items: [{ category, role, name, sprite }], ground: { w, h, px } }
export function buildScene(cfg, W, H, art) {
  const S = buildLayout(cfg, W, H);
  Object.assign(S, buildTerrain(S, art));
  Object.assign(S, buildWaterTones(S));
  Object.assign(S, buildObjects(S, art));
  Object.assign(S, buildWaterDetails(S));
  Object.assign(S, buildLife(S));
  Object.assign(S, buildBirds(S));
  S.type = 'pond';
  S.period = S.hz ? SKY_LOOP : LOOP; // 一個完整循環的秒數：有天空時要等雲飄回原位
  return S;
}

const TONE_PASSES = [toneBankReflection, toneTreeReflection, toneSwell, toneShore, toneSurf, toneSurfaceLife, toneLife, toneBirds];
const PAINT_PASSES = [paintClouds, paintWaterline, paintSwash, paintLife, paintObjects, paintBirds, paintLeaves];

// 每幀只依時間決定：同一個 t 永遠同一張圖
export function renderPond(S, out, time) {
  const { W, H, N, water, RAMP, land } = S;
  const t = (Math.round(wrap(time * S.cfg.speed) * 1e6) / 1e6) % LOOP; // 去掉浮點誤差，t 與 t+5 秒才會完全一樣
  const idx = Uint8Array.from(S.baseIdx);
  const put = (x, y, tone) => { if (x >= 0 && y >= 0 && x < W && y < H && water[y * W + x]) idx[y * W + x] = tone; };
  const pset = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  };
  const ctx = { t, time, idx, put, pset };

  for (const pass of TONE_PASSES) pass(S, ctx);
  // 色號 → 顏色（只有這裡寫水的顏色）
  for (let i = 0, o = 0; i < N; i++, o += 4) {
    const c = water[i] ? RAMP[idx[i]] : land.subarray(i * 3, i * 3 + 3);
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  for (const pass of PAINT_PASSES) pass(S, out, ctx);
}
