// 場景物件：樹、畫框大樹、花草、岸邊蘆葦與石頭、水中石頭、地標。有素材圖就用素材圖，沒有的用途用程式畫。
import { TAU, phase } from '../../core/math.js';
import { bayer, hash, hex, mix, shade } from '../../core/color.js';
import { LIB } from '../../sprites/library.js';
import { FIRE } from '../effects.js';

// 程式素材的挑選權重：依生態決定（這個地方真的長的樹、這個季節有沒有花、淡水才有香蒲…）
// 每一列 [素材名, 權重, 物種]；物種用來上色（秋葉、櫻花、桉樹的灰綠）與列出畫面裡有哪些物種
const TREE_LIB = { broadleaf: 'oak', conifer: 'pine', palm: 'palm', cactus: 'cactus', shrub: 'bush' };
export function pickTables(eco) {
  const trees = eco.trees.map(sp => {
    const type = sp.kind.split(':')[1];
    const lib = sp.deciduous && eco.bare ? 'bare' : sp.id === 'cocos-nucifera' ? 'coconut' : TREE_LIB[type];
    return [lib, type === 'shrub' ? 3 : 1, sp];
  });
  if (trees.length && eco.group !== 'E' && eco.group !== 'B') trees.push(['bush', trees.length * 0.25, null]);
  const on = (cond, row) => (cond ? [row] : []);
  return {
    back: trees.map(([lib, w, sp]) => [`flora-back-${lib}`, w, sp]),
    frame: trees.map(([lib, w, sp]) => [`flora-frame-${lib}`, w, sp]),
    ground: eco.saltwater
      ? [['flora-ground-dunegrass', 4], ['rock-ground-shells', 3], ['rock-ground-pebbles', 2]]
      : [['flora-ground-grass', 4], ...on(eco.flowers, ['flora-ground-flowers', 3.5]), ...on(trees.length, ['flora-ground-bush', 1]), ['rock-ground-pebbles', 1],
        ...on(!eco.snow && (eco.group === 'C' || eco.group === 'D'), ['flora-ground-mushroom', 0.5])],
    shore: [...on(eco.reeds.length && !eco.saltwater, ['flora-shore-reeds', 6]), ['rock-shore-boulder', 4]],
    water: [[eco.saltwater ? 'rock-sea-stack' : 'rock-water-stone', 1]],
  };
}
// 物種的外觀顏色：秋天落葉樹轉紅黃、春天櫻花是粉紅、其他用物種本身的葉色
function speciesColors(C, sp, eco) {
  if (!sp) return C;
  if (sp.deciduous && eco.autumn) return { ...C, foliage: mix(C.foliage, [196, 96, 40], 0.75) };
  if (sp.id === 'prunus-yedoensis' && eco.blossom) return { ...C, foliage: [236, 170, 196] };
  return sp.color ? { ...C, foliage: mix(C.foliage, hex(sp.color), 0.5) } : C;
}
export const FEATURES = { r: ['prop-feature-ruin-pillar', 'prop-feature-ruin-wall'], f: ['prop-feature-campfire'], t: ['prop-feature-shovel', 'prop-feature-axe-stump', 'prop-feature-bucket'] };
const featureLetter = name => (/ruin|temple|statue/.test(name) ? 'r' : /fire|camp/.test(name) ? 'f' : 't');
const SWAY = { back: 1.5, ground: 1, shore: 1.5, water: 0, feature: 0, frame: 1.5, lip: 0.5 }; // 樹梢最大擺幅（px，風力 1）

// 最近鄰縮放 k 倍（保留像素格），根部 (ax, 底列) 對齊 (x0, b)
export function placeSprite(src, x0, b, k) {
  const w = Math.max(1, Math.round(src.w * k)), h = Math.max(1, Math.round(src.h * k));
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.w - 1, Math.floor(x / k)), sy = Math.min(src.h - 1, Math.floor(y / k));
    px.set(src.px.subarray((sy * src.w + sx) * 4, (sy * src.w + sx) * 4 + 4), (y * w + x) * 4);
  }
  const x1 = x0 - Math.round((src.ax ?? (src.w >> 1)) * k), y1 = b - h + 1;
  return { x1, y1, w, h, px, base: b, cx: x0, cy: y1 + h * 0.35, r: w * 0.4 };
}

// art（選填）：{ items: [{ category, role, name, sprite }] }。需要 G.path、G.kind、G.land（地面圖層）與 G.pickWater（水面圖層）
export function buildObjects(G, art) {
  const { cfg, eco, sea, habitat, W, H, N, s, R, C, hz, GH, cx, cy, rx, ry, persp, treeSize, jitter, water, depth, distW, distL, topY, isFarLand, isFarWater, light, face, path, wIdx, pickWater } = G;
  const items = art?.items || [];
  const maxH = Math.max(0, ...items.map(a => a.sprite.h));
  const packK = (maxH > 40 ? 34 / maxH : 1) * s * cfg.artSize; // 整包共用倍率：石頭維持比樹小
  const fromAsset = (a, f = 1) => ({ sprite: a.sprite, k: packK * f, name: a.name, flora: a.category === 'flora' });
  const PICK = pickTables(eco);
  const fromLib = (name, z, sp) => ({ sprite: LIB[name](speciesColors(C, sp, eco), R, z), k: 1, name, flora: name.startsWith('flora'), species: sp?.id });
  const pickW = list => { let u = R() * list.reduce((n, [, w]) => n + w, 0); for (const row of list) if ((u -= row[1]) < 0) return row; return list[0]; };
  const fromTable = (list, z) => { const [name, , sp] = pickW(list); return fromLib(name, z, sp); };
  // f：相對大小（透視 × 個體差異）。程式素材用它當畫筆尺度，素材圖用它縮放
  const choose = (role, f) => {
    const pool = items.filter(a => a.role === role);
    return pool.length ? fromAsset(pool[(R() * pool.length) | 0], f) : PICK[role].length ? fromTable(PICK[role], f * s) : null;
  };
  const objs = [];
  const add = (m, x, b, role) => {
    if (!m) return; // 這裡沒有這類物種（例如海洋上沒有樹）
    const o = placeSprite(m.sprite, x, b, m.k);
    // 物件吃所在位置的光：站在樹蔭裡就整個壓暗偏冷（範例裡樹蔭下的石頭和草都是冷暗色）
    const L = light[Math.min(H - 1, Math.max(0, b)) * W + Math.min(W - 1, Math.max(0, x))];
    if (L && role !== 'water') for (let p = 0; p < o.px.length; p += 4) if (o.px[p + 3]) {
      const c = L === 1 ? shade(o.px.subarray(p, p + 3), 0.95) : L === 2 ? mix(shade(o.px.subarray(p, p + 3), 0.86), [50, 96, 104], 0.1) : mix(shade(o.px.subarray(p, p + 3), 0.74), [40, 84, 96], 0.16);
      o.px[p] = c[0]; o.px[p + 1] = c[1]; o.px[p + 2] = c[2];
    }
    Object.assign(o, { role, name: m.name, species: m.species, sway: m.flora ? SWAY[role] * s : 0, ph: R() * TAU });
    o.anim = m.sprite.anim || (/campfire|bonfire/.test(m.name) ? 'fire' : null);
    objs.push(o);
  };

  // 後方：一半站對岸土坡後、三成在後方林線、兩成在左右；大小 = 透視 × 現實分佈
  const landSpot = () => { for (let n = 0; n < 60; n++) { const x = (R() * W) | 0, y = (hz + R() * GH) | 0; if (y < H && !water[y * W + x] && distL[y * W + x] > GH * 0.18) return [x, y]; } return null; }; // 海邊的樹長在沙丘上，不在濕沙灘
  for (let k = 0; k < cfg.trees; k++) {
    if (sea) { const p = landSpot(); if (p) add(choose('back', treeSize() * persp(p[1])), p[0], p[1], 'back'); continue; } // 海邊：樹只長在沙丘上
    const t = R();
    let x, b;
    if (t < 0.5) {
      x = cx + (R() * 2 - 1) * rx * 0.95; const ty = topY[Math.round(Math.min(W - 1, Math.max(0, x)))];
      b = ty >= 0 ? ty - face - 1 - R() * 3 * s : cy - ry;
    } else if (t < 0.8) { x = R() * W; b = hz + GH * (0.06 + R() * 0.16); }
    else { x = cx + (R() < 0.5 ? -1 : 1) * rx * (1.05 + R() * 0.3); b = cy - ry * 0.2 + R() * ry * 0.7; }
    x = Math.round(Math.min(W - 1, Math.max(0, x))); b = Math.round(Math.min(H - 1, Math.max(1, b)));
    if (!water[b * W + x]) add(choose('back', treeSize() * persp(b)), x, b, 'back');
  }
  // 畫框：畫面左右與上緣的大樹、角落灌木，被畫面裁掉一部分，把視線框向池塘（不倒映）
  const backArt = items.filter(a => a.role === 'back');
  // 第 4 種是前景：樹根在畫面下緣外，樹冠從下方伸進來蓋住一部分池塘
  const frameAt = (x, b) => {
    x = Math.round(x); b = Math.round(b);
    if (b < 0 || b >= H * 1.3 || x < -20 || x >= W + 20 || (b < H && water[b * W + Math.min(W - 1, Math.max(0, x))])) return;
    const f = persp(b) * jitter(0.75, 1.2);
    add(backArt.length ? fromAsset(backArt[(R() * backArt.length) | 0], 1.7 * f) : PICK.frame.length ? fromTable(PICK.frame, s * f) : null, x, b, 'frame');
  };
  if (cfg.trees > 0 && habitat !== 'ocean') {
    const n = Math.min(8, Math.round(cfg.trees / 2.2));
    for (let k = 0; k < n; k++) {
      const side = k % 4;
      if (side === 0) frameAt(-2 * s + R() * 10 * s, H * (0.45 + R() * 0.5));
      else if (side === 1) frameAt(W + 2 * s - R() * 10 * s, H * (0.35 + R() * 0.6));
      else if (side === 2) frameAt(W * (0.1 + R() * 0.8), hz + GH * (0.04 + R() * 0.1));
      else if (habitat !== 'lake') frameAt(cx + (R() < 0.5 ? -1 : 1) * rx * jitter(0.3, 0.9), H * jitter(1.02, 1.2)); // 湖的近岸在畫面外，前景樹會像長在水裡
    }
  }
  // 草地上的花草、灌木、小石頭、蘑菇
  // 數量依素材大小調整：程式草叢約 20 個不透明像素，16×16 的素材圖大很多，同樣數量會鋪滿草地
  const groundArt = items.filter(a => a.role === 'ground');
  const opaque = sp => { let n = 0; for (let o = 3; o < sp.px.length; o += 4) if (sp.px[o]) n++; return n; };
  const avgArea = groundArt.length ? groundArt.reduce((n, a) => n + opaque(a.sprite), 0) / groundArt.length * packK * packK : 20;
  const nGround = Math.round(W * H / 2200 * cfg.decor * Math.min(1, 30 / avgArea));
  for (let k = 0, n = 0; k < nGround && n < nGround * 20; n++) {
    const x = (R() * W) | 0, y = (hz + GH * 0.06 + R() * GH * 0.94) | 0, i = y * W + x;
    if (water[i] || path[i] || distL[i] < 3 * s || (isFarLand(x, y) && topY[x] - y <= face + 2)) continue;
    add(choose('ground', persp(y) * jitter(0.7, 1.3)), x, y, 'ground'); k++;
  }
  // 岸邊（近岸與側岸）的蘆葦、大石頭；水中的石頭
  const shoreSpots = wIdx.filter(i => distW[i] < 1.5 && !isFarWater(i) && (!sea || (i / W | 0) > hz + 2)); // 海平線不是岸
  for (let k = 0; k < Math.round(7 * cfg.decor) && shoreSpots.length; k++) {
    const i = shoreSpots[(R() * shoreSpots.length) | 0];
    add(choose('shore', persp(i / W) * jitter(0.75, 1.3)), i % W, (i / W) | 0, 'shore');
  }
  // 近岸與側岸一圈垂到水面上的草（範例的岸幾乎都被草蓋住，看不到硬邊）
  if (!sea && !items.some(a => a.role === 'shore')) {
    const lip = [];
    for (let i = 0; i < N; i++) if (!water[i] && distL[i] < 1.5 && !isFarLand(i % W, (i / W) | 0)) lip.push(i);
    for (let k = 0, n = Math.round(lip.length / 7 * cfg.decor); k < n; k++) {
      const i = lip[(R() * lip.length) | 0];
      add(fromLib('flora-shore-grass', s * persp(i / W) * jitter(0.8, 1.2)), i % W, (i / W) | 0, 'lip');
    }
  }
  for (let k = 0; k < Math.round(2 * cfg.decor); k++) {
    const i = pickWater(i => depth[i] >= 6 * s && (i / W | 0) > hz + GH * 0.12); // 不放在海平線上
    if (i >= 0) add(choose('water', persp(i / W) * jitter(0.6, 1.3)), i % W, (i / W) | 0, 'water');
  }
  // 地標：遺跡 r、火堆 f、遺落工具 t，放在近側與左右的草地上，彼此分開
  const spots = [];
  for (const L of String(cfg.props).replace(/[^rft]/g, '')) {
    const pool = items.filter(a => a.role === 'feature' && featureLetter(a.name) === L).sort(() => R() - 0.5);
    const names = [...FEATURES[L]].sort(() => R() - 0.5);
    const count = L === 'f' ? 1 : 2;
    for (let c = 0; c < count; c++) {
      for (let n = 0; n < 300; n++) {
        const x = (W * 0.06 + R() * W * 0.88) | 0, y = (cy - ry * 0.3 + R() * (H - cy + ry * 0.3 - 3)) | 0, i = y * W + x;
        if (y >= H || water[i] || path[i] || distL[i] < 5 * s || distL[i] > 45 * s || spots.some(p => Math.hypot(p[0] - x, p[1] - y) < 26 * s)) continue;
        spots.push([x, y]);
        add(pool.length ? fromAsset(pool[c % pool.length], persp(y)) : fromLib(names[c % names.length], s * persp(y)), x, y, 'feature');
        break;
      }
    }
  }
  objs.sort((a, b) => a.base - b.base);
  castShadows(G, objs);
  return { objs };
}

// 投影：每個站在地上的物件往右下拖一塊扁橢圓，壓暗一階、偏冷（靜態，直接畫進地面）
function castShadows({ W, H, N, water, kind, land }, objs) {
  const shaded = new Uint8Array(N);
  for (const o of objs) {
    if (o.role === 'water' || o.role === 'lip') continue;
    const big = o.role === 'frame' || o.role === 'back', erx = Math.max(2, o.w * (big ? 0.55 : 0.45)), ery = Math.max(1, erx * (big ? 0.45 : 0.35));
    const ex = o.cx + erx * 0.35, ey = o.base + ery * 0.3;
    for (let y = Math.floor(ey - ery); y <= ey + ery; y++) for (let x = Math.floor(ex - erx); x <= ex + erx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x, d = ((x - ex) / erx) ** 2 + ((y - ey) / ery) ** 2;
      if (water[i] || shaded[i] || !kind[i] || d > 1 + (bayer(x, y) - 0.5) * 0.3) continue;
      shaded[i] = 1;
      const c = mix(shade(land.subarray(i * 3, i * 3 + 3), 0.78), [40, 80, 92], 0.18);
      land[i * 3] = c[0]; land[i * 3 + 1] = c[1]; land[i * 3 + 2] = c[2];
    }
  }
}

// 風：越靠樹梢擺越多，整像素位移；倒影用同一個函式，樹動影子也跟著動
export function swayDx(o, row, t, wind) {
  if (!o.sway || !wind) return 0;
  const f = (o.h - 1 - row) / Math.max(1, o.h - 1);
  return Math.round(o.sway * wind * f * f * (0.75 * Math.sin(phase(t, 1) + o.ph) + 0.25 * Math.sin(phase(t, 3) + o.ph * 2)));
}

// 依站立位置由後往前畫，花草樹木隨風擺動，火堆的火焰逐格跳動
export function paintObjects(S, out, { t, pset }) {
  const { W, H, cfg } = S;
  for (const o of S.objs) {
    for (let r = 0; r < o.h; r++) {
      const y = o.y1 + r;
      if (y < 0 || y >= H) continue;
      const dx = swayDx(o, r, t, cfg.wind);
      for (let c = 0; c < o.w; c++) {
        const p = (r * o.w + c) * 4, x = o.x1 + c + dx;
        if (!o.px[p + 3] || x < 0 || x >= W) continue;
        const q = (y * W + x) * 4; out[q] = o.px[p]; out[q + 1] = o.px[p + 1]; out[q + 2] = o.px[p + 2];
      }
    }
    if (o.anim === 'fire') { // 每 0.1 秒換一格：中間高兩側低、隨機跳動，火心亮、往上變暗紅；偶爾飄出火星
      const f = Math.floor(t * 10) % 50, fx = o.cx, fy = o.base - Math.round(o.h * 0.55), wf = Math.max(2, Math.round(o.w / 4.5));
      for (let c = -wf; c <= wf; c++) {
        const hgt = Math.max(0, Math.round((wf * 1.9 - Math.abs(c) * 1.2 + hash(c + 9, f, 9) * wf * 1.3) * (o.w / 12)));
        for (let k = 0; k < hgt; k++) {
          const u = k / Math.max(1, hgt) + Math.abs(c) / (wf * 3);
          if (k === hgt - 1 && hash(c, f + k, 2) < 0.4) continue; // 火焰尖端忽隱忽現
          pset(fx + c, fy - k, FIRE[Math.min(4, Math.floor(u * 4.2))]);
        }
      }
      if (hash(f, 1, 3) > 0.5) pset(fx + Math.round((hash(f, 2, 3) - 0.5) * wf * 2), fy - wf * 3 - (f % 4), FIRE[hash(f, 4, 3) > 0.5 ? 1 : 3]);
    }
  }
}
