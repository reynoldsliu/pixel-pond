// node test.js — 檢查關鍵字解析、素材命名、渲染器（不需瀏覽器）
import assert from 'node:assert';
import { DEFAULTS, PALETTES, LOOP, SKY_LOOP, PHOTO_SKY_LOOP, parsePrompt, parseAssetName, trimSprite, pixelate, segment, buildPhotoScene, buildScene, renderFrame, RANGES, sanitize, encodeConfig, decodeConfig, ecology } from './src/index.js';
import { hash } from './src/core/color.js';
import { createHash } from 'node:crypto';

// 「秋天黃昏」：黃昏的天空 + 秋天的樹；地標會累加
const { patch, matched } = parsePrompt('起風的秋天黃昏，很多荷葉');
assert.deepStrictEqual(matched, ['黃昏', '秋天', '起風', '荷葉']);
assert.strictEqual(patch.sky, PALETTES.sunset.sky);
assert.strictEqual(patch.foliage, PALETTES.autumn.foliage);
assert.strictEqual(patch.wind, 2.5);
assert.strictEqual(parsePrompt('遺跡旁的火堆').patch.props, 'rf');
assert.deepStrictEqual(parsePrompt('hello').matched, []);

// 素材檔名：<分類>-<用途>-<名字>
assert.deepStrictEqual(parseAssetName('flora-back-oak-2.png'), { category: 'flora', role: 'back', name: 'oak-2' });
assert.deepStrictEqual(parseAssetName('x/Prop-Feature-Campfire.PNG'), { category: 'prop', role: 'feature', name: 'campfire' });
for (const bad of ['tree1.png', 'flora-sky-oak.png', 'flora-back-.png', '../flora-back-oak.png.exe']) assert.strictEqual(parseAssetName(bad), null, bad);

const frame = (cfg, t, art) => {
  const S = buildScene(cfg, 320, 180, art), out = new Uint8ClampedArray(320 * 180 * 4);
  renderFrame(S, out, t);
  return { S, out };
};
const diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i]), 0);
// 水面顏色數（扣掉被物件、荷葉、葉子蓋住的像素）
const waterColors = ({ S, out }) => {
  const covered = new Set();
  for (const o of S.objs) for (let r = 0; r < o.h; r++) for (let c = 0; c < o.w; c++) if (o.px[(r * o.w + c) * 4 + 3]) covered.add((o.y1 + r) * 320 + o.x1 + c);
  return new Set(S.wIdx.filter(i => !covered.has(i)).map(i => out.slice(i * 4, i * 4 + 3).join())).size;
};

const ALL = { ...DEFAULTS, props: 'prft' };
const full = frame(ALL, 1.3);
assert(full.S.wIdx.length > 5000, 'pond has water');
assert(full.S.reflTrees.length > 0, 'trees behind the pond');
for (const role of ['back', 'ground', 'shore', 'feature', 'frame', 'lip']) assert(full.S.objs.some(o => o.role === role), `has ${role} objects`);
assert(full.S.objs.some(o => o.anim === 'fire'), 'campfire placed');
assert(full.S.contact.length > 0, 'contact line around things in water');
assert(diff(full.out, frame(DEFAULTS, 2.1).out) > 100, 'animates over time');
for (const t of [0, 1.3, 3.7]) assert.strictEqual(diff(frame(DEFAULTS, t).out, frame(DEFAULTS, t + SKY_LOOP).out), 0, `seamless sky loop at ${t}`);
const ground = { ...DEFAULTS, horizon: 0 };
for (const t of [0, 1.3, 3.7]) assert.strictEqual(diff(frame(ground, t).out, frame(ground, t + LOOP).out), 0, `seamless water loop at ${t}`);
assert(diff(frame(DEFAULTS, 0).out, frame(DEFAULTS, 20).out) > 0, 'clouds drift');
// 風：只有風會動的情況下，樹也會動；風 0 時物件不動
const still = { ...DEFAULTS, steps: '', wobble: 0, lilies: 0 };
assert(diff(frame(still, 0.6).out, frame(still, 1.9).out) > 0, 'wind sways flora');
assert(diff(frame(still, 0.6).out, frame(still, 0.65).out) >= 0);
const noWind = { ...still, wind: 0, props: '', fauna: 0, birds: 0, horizon: 0 };
assert.strictEqual(diff(frame(noWind, 0.6).out, frame(noWind, 1.9).out), 0, 'no wind, no motion');
// 水面只用 10 色色階（風 0 讓物件位置固定，扣掉物件後計算）
const bare = { ...DEFAULTS, lilies: 0, leaves: 0, wind: 0, props: '', fauna: 0, birds: 0 }; // 火堆火星可能飛過水面，那是物件不是水
for (const t of [0.4, 2.2]) assert(waterColors(frame(bare, t)) <= 10, 'water stays on the 10-tone ramp');
assert(waterColors(frame({ ...bare, steps: '' }, 0)) <= 2, 'all layers off = flat tile');
assert(diff(full.out, frame({ ...DEFAULTS, steps: '' }, 1.3).out) > 5000, 'six steps change the picture');
for (const n of '123456') assert(diff(frame({ ...DEFAULTS, steps: n }, 1.3).out, frame({ ...DEFAULTS, steps: '' }, 1.3).out) > 0, `step ${n} does something`);

// 素材圖：裁透明邊、二值化，並依用途取代程式畫的物件
const raw = { width: 12, height: 24, data: new Uint8ClampedArray(12 * 24 * 4) };
for (let y = 4; y < 22; y++) for (let x = 3; x < 9; x++) raw.data.set(y > 16 ? [90, 60, 30, 255] : [40, 140 + y, 60, 200], (y * 12 + x) * 4);
raw.data[3] = 60; // 半透明雜點 → 應被丟掉
const sprite = trimSprite(raw);
assert.deepStrictEqual([sprite.w, sprite.h], [6, 18], 'trimmed to opaque box');
assert(sprite.px.every((v, i) => i % 4 !== 3 || v === 0 || v === 255), 'alpha is binary');
assert.strictEqual(trimSprite({ width: 2, height: 2, data: new Uint8ClampedArray(16) }), null, 'empty image');
const art = {
  items: [{ category: 'flora', role: 'back', name: 'test', sprite }],
  ground: { w: 2, h: 1, px: new Uint8ClampedArray([200, 0, 0, 255, 0, 0, 200, 255]) },
};
const withArt = frame(DEFAULTS, 1.3, art);
assert(withArt.S.reflTrees.length > 0 && withArt.S.reflTrees.every(T => T.name === 'test' && T.h >= 3 && T.h <= 18 * 2.6), 'back sprites scale with distance and size spread');
assert(withArt.S.objs.some(o => o.role === 'ground' && o.name !== 'test'), 'other roles still drawn by code');
assert(withArt.S.land.some((v, i) => i % 3 === 0 && v > 150 && withArt.S.land[i + 1] < 40), 'ground image used');
assert(full.S.land.some((v, i) => i % 3 === 0 && full.S.kind[i / 3] === 1 && i / 3 < 320 * (full.S.hz + 12) && !full.S.water[i / 3]), "path reaches the horizon");
const big = { w: 6, h: 340, px: new Uint8ClampedArray(6 * 340 * 4).fill(255) };
assert(buildScene(DEFAULTS, 320, 180, { items: [{ category: 'flora', role: 'back', name: 'big', sprite: big }] }).reflTrees.every(T => T.h <= 34 * 2.6), 'huge sprites shrink to the ~34 px pack scale');

// 邊界設定不能爆
for (const extra of [{ trees: 0, leaves: 30 }, { lilies: 16, pond: 0.4 }, { pond: 1, width: 480 }, { ripples: 2, sparkles: 2, decor: 2, wind: 3 }, { decor: 0, props: '' }]) {
  const cfg = { ...DEFAULTS, ...extra }, S = buildScene(cfg, cfg.width, Math.round(cfg.width * 9 / 16));
  for (let t = 0; t < LOOP; t += 0.25) renderFrame(S, new Uint8ClampedArray(S.W * S.H * 4), t);
}
// 透視：同一種東西，畫面下方的平均比上方大
// （用固定 18 px 的素材圖量，程式畫的小草叢太小、取整後看不出差別）
const persp = buildScene({ ...DEFAULTS, decor: 2 }, 320, 180, { items: [{ category: 'flora', role: 'ground', name: 'g', sprite }] });
const grounds = persp.objs.filter(o => o.role === 'ground'), avgH = list => list.reduce((n, o) => n + o.h, 0) / Math.max(1, list.length);
assert(avgH(grounds.filter(o => o.base > 130)) > avgH(grounds.filter(o => o.base < persp.hz + 30)) * 1.3, 'nearer things are bigger');
// 池塘位置依種子變化
assert(new Set([1, 2, 3, 4].map(seed => buildScene({ ...DEFAULTS, seed }, 320, 180).cx.toFixed(1))).size > 1, 'pond position varies');
// 天空與水生動物
assert(full.S.hz > 0 && full.S.kind[0] === 0 && buildScene({ ...DEFAULTS, horizon: 0 }, 320, 180).hz === 0, 'sky band, and none when horizon = 0');
assert(full.S.fish.length > 0 && full.S.ducks.length > 0, 'fish and ducks placed');
const zoo = { ...DEFAULTS, horizon: 0, steps: '', wind: 0, props: '', lilies: 0, fauna: 2 };
assert(diff(frame(zoo, 0.5).out, frame(zoo, 1.7).out) > 0, 'animals move');
assert.strictEqual(diff(frame(zoo, 0.5).out, frame(zoo, 0.5 + LOOP).out), 0, 'animals loop seamlessly');
// 圖片像素化：縮到指定寬、顏色數不超過設定、去背後四角透明、主體保留
{
  const W = 60, H = 40, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set((x - 30) ** 2 + (y - 20) ** 2 < 150 ? [40 + x * 3, 140, 60 + y, 255] : [235, 240, 250, 255], (y * W + x) * 4);
  const r = pixelate({ width: W, height: H, data }, { width: 15, colors: 5, removeBg: 1 });
  assert.deepStrictEqual([r.width, r.height], [15, 10], 'pixelate keeps aspect');
  assert(new Set(Array.from({ length: 150 }, (_, i) => i).filter(i => r.data[i * 4 + 3]).map(i => r.data.slice(i * 4, i * 4 + 3).join())).size <= 5, 'pixelate limits colors');
  assert.strictEqual(r.data[3], 0, 'background removed');
  assert.strictEqual(r.data[(5 * 15 + 7) * 4 + 3], 255, 'subject kept');
  assert(trimSprite(r), 'pixelated image works as a sprite');
}
// 複雜背景去背：雜色方塊背景上的綠色圓形主體，交集/聯集要夠高
{
  const W = 200, H = 150, data = new Uint8ClampedArray(W * H * 4), truth = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = ((x - 100) / 45) ** 2 + ((y - 75) / 40) ** 2 < 1, h = hash(x >> 3, y >> 3, 2);
    truth[i] = inside ? 1 : 0;
    data.set(inside ? [60 + h * 40, 140 + h * 50, 50, 255] : [80 + h * 170, 60 + hash(x >> 3, y >> 3, 3) * 150, 40 + hash(x >> 3, y >> 3, 4) * 200, 255], i * 4);
  }
  const m = segment({ width: W, height: H, data });
  let inter = 0, uni = 0;
  for (let i = 0; i < W * H; i++) { const b = m.mask[Math.floor(((i / W) | 0) * m.height / H) * m.width + Math.floor((i % W) * m.width / W)]; inter += truth[i] && b; uni += truth[i] || b; }
  assert(inter / uni > 0.7, `segment IoU ${(inter / uni).toFixed(2)}`);
}
// 風景照轉換：天空藍在上、綠地在中、藍色水在下 → 只有下方是水；水面會動、5 秒無縫
{
  const W = 400, H = 300, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(y < 90 ? [150, 190, 235, 255] : y < 190 ? [70 + (x % 7) * 4, 120, 50, 255] : [40, 90 + (y % 5) * 6, 130, 255], (y * W + x) * 4);
  const S = buildPhotoScene({ width: W, height: H, data }, 160, 90, DEFAULTS);
  assert(S.wIdx.length > 160 * 25 && S.wIdx.every(i => i / 160 >= 50), 'photo water found only in the lower part');
  const a = new Uint8ClampedArray(160 * 90 * 4), b = new Uint8ClampedArray(160 * 90 * 4), c = new Uint8ClampedArray(160 * 90 * 4);
  renderFrame(S, a, 0.7); renderFrame(S, b, 1.9); renderFrame(S, c, 0.7 + LOOP);
  assert(diff(a, b) > 0 && diff(a, c) === 0, 'photo water animates and loops');
  assert(S.palette.length <= 20, 'photo palette limited');
}
// 照片的雲：藍天上的白雲拆出來飄，PHOTO_SKY_LOOP 秒一圈；地面不受影響
{
  const W = 400, H = 300, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(y < 120 ? ((x - 100) ** 2 / 4 + (y - 50) ** 2 < 900 ? [250, 250, 250, 255] : [110, 160, 230, 255]) : [150, 110, 70, 255], (y * W + x) * 4);
  const S = buildPhotoScene({ width: W, height: H, data }, 160, 90, DEFAULTS), n = 160 * 90 * 4;
  assert(S.cloud && S.period === PHOTO_SKY_LOOP, 'photo clouds found');
  const a = new Uint8ClampedArray(n), b = new Uint8ClampedArray(n), c = new Uint8ClampedArray(n);
  renderFrame(S, a, 3); renderFrame(S, b, 3 + 30); renderFrame(S, c, 3 + PHOTO_SKY_LOOP);
  assert(diff(a.subarray(0, 160 * 30 * 4), b.subarray(0, 160 * 30 * 4)) > 0 && diff(a, c) === 0, 'photo clouds drift and loop');
  assert(diff(a.subarray(160 * 50 * 4), b.subarray(160 * 50 * 4)) === 0, 'ground stays put');
}
// raw：已經是像素畫的圖不再減色，透明保留
{
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) if (i % 32 > 8) data.set([40 + (i % 7) * 30, 200, 60, 255], i * 4);
  const S = buildPhotoScene({ width: 32, height: 32, data }, 32, 32, DEFAULTS, { raw: true });
  assert(S.base[3] === 0 && S.base[20 * 4 + 3] === 255 && S.base[20 * 4] === data[20 * 4], 'raw keeps pixels and alpha');
}
// 網址是外部輸入：夾範圍、驗格式；編碼只寫和預設不同的值
{
  const c = decodeConfig('trees=999&grass=red&props=zzrf&seed=abc&evil=1');
  assert(c.trees === RANGES.trees[1] && c.grass === DEFAULTS.grass && c.props === 'rf' && c.seed === DEFAULTS.seed && !('evil' in c), 'config sanitized');
  assert.strictEqual(encodeConfig({ ...DEFAULTS, trees: 3 }), 'trees=3');
  assert.deepStrictEqual(decodeConfig(encodeConfig({ ...DEFAULTS, palette: 'night', wind: 2 })), sanitize({ ...DEFAULTS, palette: 'night', wind: 2 }));
}
// 每種場景都帶 period（錄影要錄整數圈）
assert.strictEqual(buildScene({ ...DEFAULTS, horizon: 0 }, 160, 90).period, LOOP);
assert.strictEqual(buildScene(DEFAULTS, 160, 90).period, SKY_LOOP);
// 畫面快照：同一組設定、同一時間點的像素要和記錄的一樣。重構時用來確認畫面沒被改到；
// 刻意改畫風時，用 UPDATE_SNAPSHOTS=1 node test.js 印出新值再貼回來。
{
  const cases = [
    [{ ...DEFAULTS }, 320],
    [{ ...DEFAULTS, props: 'prft', fauna: 3, lilies: 12, leaves: 14, ripples: 2, wind: 2 }, 320],
    [{ ...DEFAULTS, horizon: 0, seed: 3, ...PALETTES.night, palette: 'night' }, 240],
    [{ ...DEFAULTS, steps: '135', seed: 99 }, 320],
  ];
  const want = ['5ae86454fa20', '87d41cadaac3', '823d0817a08b', 'f74f8d45778f'];
  const got = cases.map(([cfg, W]) => {
    const H = Math.round(W * 9 / 16), S = buildScene(cfg, W, H), o = new Uint8ClampedArray(W * H * 4), h = createHash('sha1');
    for (const t of [0, 0.37, 1.9, 3.3, 4.7, 17.2, 41]) { renderFrame(S, o, t); h.update(o); }
    return h.digest('hex').slice(0, 12);
  });
  if (process.env.UPDATE_SNAPSHOTS) console.log(JSON.stringify(got));
  else assert.deepStrictEqual(got, want, 'render snapshots changed');
}
// 生態：地理區、氣候、物種出現的地方要合理
{
  const { realmOf, koppen, ecosystem, sunElevation } = ecology;
  assert.deepStrictEqual([[25, 121.5], [21.3, -157.9], [-33.9, 151.2], [-8.4, 115.2], [-3.1, -60], [51.5, -0.1], [40.7, -74], [-1.3, 36.8]].map(p => realmOf(...p)),
    ['IM', 'OC', 'AU', 'IM', 'NT', 'PA', 'NA', 'AT'], 'realms');
  const T = (a, b) => Array.from({ length: 12 }, (_, m) => a + (b - a) * (1 - Math.cos(m / 11 * Math.PI)) / 2);
  assert.strictEqual(koppen(Array(12).fill(27), Array(12).fill(200), 1)[0], 'A', 'tropical');
  assert.strictEqual(koppen(T(13, 35), Array(12).fill(1), 30).slice(0, 2), 'BW', 'desert');
  assert.strictEqual(koppen(Array(12).fill(5), Array(12).fill(60), 70), 'ET', 'tundra');
  const eco = (lat, lon, kp, habitat = 'pond', month = 7) => ecosystem({ ...DEFAULTS, lat, lon, kp, habitat, month });
  const ids = e => e.species.map(s => s.id);
  for (const [lat, lon, kp] of [[51.5, -0.1, 'Cfb'], [40.7, -74, 'Cfa'], [25, 121.5, 'Cfa'], [-33.9, 18.4, 'Csb']])
    for (const h of ['pond', 'lake', 'coast', 'ocean']) {
      const e = eco(lat, lon, kp, h);
      assert(!e.birds.some(b => b.kind === 'bird:penguin') || lat < 0, 'penguins only in the south');
      assert(!e.fish.some(f => f.kind === 'fish:koi') || (h === 'pond' && lon > 100), 'koi only in East Asian ponds');
      if (e.saltwater) assert(!e.lilies.length && !e.frogs.length && !e.reeds.length, 'no lilies, frogs, reeds in salt water');
      assert(!e.trees.some(t => t.id === 'opuntia') || lon < -30, 'cactus only in the Americas');
    }
  assert(ids(eco(-33.9, 18.4, 'Csb', 'coast')).includes('spheniscus-demersus'), 'African penguin at Cape Town');
  assert(eco(46, 7, 'Dfb', 'pond', 1).bare && eco(46, 7, 'Dfb', 'pond', 1).snow, 'winter in the Alps is bare and snowy');
  assert(!eco(1.3, 103.8, 'Af', 'pond', 1).bare, 'no winter in the tropics');
  assert(eco(-33.9, 151.2, 'Cfa', 'pond', 1).season === 'summer', 'January is summer in Sydney');
  const noon = sunElevation(new Date('2026-06-21T04:00:00Z'), 25, 121.5), night = sunElevation(new Date('2026-06-21T16:00:00Z'), 25, 121.5);
  assert(noon > 80 && night < -30, 'sun elevation in Taipei');
  // 鳥：物種來自生態系、行為循環無接縫
  const coast = { ...DEFAULTS, lat: -33.9, lon: 18.4, kp: 'Csb', habitat: 'coast', birds: 3, horizon: 0 };
  const S = buildScene(coast, 320, 180), allowed = new Set(ids(ecosystem(coast)));
  assert(S.birds.length > 0 && S.birds.every(b => allowed.has(b.species)), 'birds come from the local ecosystem');
  for (const t of [0.4, 2.2]) assert.strictEqual(diff(frame(coast, t).out, frame(coast, t + LOOP).out), 0, `seamless coast loop at ${t}`);
}
console.log('ok');
