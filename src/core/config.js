// 設定：配色、預設值、循環長度。純資料，沒有相依。
export const PALETTES = {
  forest: { sky: '#c4ece2', shallow: '#5d9fa6', deep: '#24505a', grass: '#86a03e', dirt: '#6e4f36', foliage: '#3f6b40', trunk: '#5a4030', leaf: '#c9a645' },
  day:    { sky: '#cfeeff', shallow: '#5fbfc4', deep: '#1d4f7a', grass: '#5c9e45', dirt: '#8b6a43', foliage: '#2e7d3a', trunk: '#5b3b25', leaf: '#7cc357' },
  sunset: { sky: '#ffc48a', shallow: '#c98f78', deep: '#2f3466', grass: '#7a8b3c', dirt: '#7a5038', foliage: '#3e5a2a', trunk: '#4a2e22', leaf: '#e0a050' },
  night:  { sky: '#6f7fc0', shallow: '#2c5c78', deep: '#0a1630', grass: '#26492f', dirt: '#3e3328', foliage: '#163322', trunk: '#2a1d16', leaf: '#4f7a4a' },
  autumn: { sky: '#e9f0f5', shallow: '#6aaab0', deep: '#24506a', grass: '#8f9a48', dirt: '#80603e', foliage: '#c0602a', trunk: '#4e3322', leaf: '#e8a03a' },
  sakura: { sky: '#e6f4ff', shallow: '#76c6cc', deep: '#2a5a86', grass: '#6fae52', dirt: '#8b6a43', foliage: '#e594b2', trunk: '#5b3b25', leaf: '#f7c6d8' },
};
export const COLOR_KEYS = Object.keys(PALETTES.forest);

export const DEFAULTS = Object.assign({
  prompt: '', seed: 7, palette: 'forest', steps: '123456', props: 'p', width: 320, pond: 0.9, trees: 14,
  decor: 1.2, wind: 1, depth: 14, wobble: 1, speed: 1, ripples: 0.5, sparkles: 0.6, leaves: 2, lilies: 5, fps: 24,
  horizon: 0.22, fauna: 1, // horizon：畫面上方天空佔的比例（0 = 全是地面）；fauna：水生動物多寡
  art: 1, artSize: 1, // art=1：有素材圖就用素材圖
  // 生態：habitat 水域類型；birds 鳥的多寡；lat/lon/elev/kp/place 選定的地點與它的氣候（空白 = 預設的溫帶歐亞）；
  // month 0 = 跟著今天；live 1 = 依當地時間與天氣即時換色；exclude = GBIF 附近查無紀錄而排除的物種
  habitat: 'pond', birds: 1, lat: '', lon: '', elev: '', kp: '', place: '', month: 0, live: 0, exclude: '',
}, PALETTES.forest);

export const LOOP = 5; // 秒（水面、動物、風）
export const SKY_LOOP = 60; // 秒：雲飄一整個畫面寬的時間（= 12 個水面循環，所以整段仍可無縫重播）

export const PHOTO_SKY_LOOP = 120; // 秒：照片裡的雲飄過兩個畫面寬（雲圖鏡像接成 2 倍寬）的時間，是 LOOP 的整數倍

// 數值設定的合法範圍（網址是外部輸入，一律夾在範圍內）；面板滑桿也從這裡拿 min/max，只寫一次
export const RANGES = {
  horizon: [0, 0.45], pond: [0.4, 1], trees: [0, 24], decor: [0, 2], fauna: [0, 3], lilies: [0, 16],
  birds: [0, 3], month: [0, 12],
  wind: [0, 3], speed: [0.2, 3], wobble: [0, 3], depth: [4, 30], ripples: [0, 2], sparkles: [0, 2], leaves: [0, 30],
  artSize: [0.4, 2.5], width: [160, 480], fps: [6, 60],
};

export function sanitize(c) {
  for (const [k, [min, max]] of Object.entries(RANGES)) c[k] = Math.min(max, Math.max(min, Number.isFinite(+c[k]) ? +c[k] : DEFAULTS[k]));
  c.width = Math.round(c.width / 16) * 16;
  for (const k of COLOR_KEYS) if (!/^#[0-9a-f]{6}$/i.test(c[k])) c[k] = DEFAULTS[k];
  c.seed = Number.isFinite(+c.seed) ? Math.floor(+c.seed) : DEFAULTS.seed;
  c.steps = [...'123456'].filter(n => String(c.steps).includes(n)).join('');
  c.props = [...'prft'].filter(n => String(c.props).includes(n)).join('');
  if (!PALETTES[c.palette]) c.palette = DEFAULTS.palette;
  c.prompt = String(c.prompt).slice(0, 200);
  c.art = +c.art ? 1 : 0;
  c.live = +c.live ? 1 : 0;
  c.month = Math.round(c.month);
  if (!['pond', 'lake', 'coast', 'ocean'].includes(c.habitat)) c.habitat = DEFAULTS.habitat;
  // 地點：座標四捨五入到 0.1°（約 11 km），網址不會帶著精確位置
  const la = +c.lat, lo = +c.lon;
  if (c.lat === '' || c.lon === '' || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) Object.assign(c, { lat: '', lon: '', elev: '', kp: '', place: '' });
  else { c.lat = Math.round(la * 10) / 10; c.lon = Math.round(lo * 10) / 10; c.elev = Number.isFinite(+c.elev) && c.elev !== '' ? Math.round(+c.elev) : ''; }
  if (!/^([A-E][A-Za-z]{1,2})?$/.test(c.kp)) c.kp = '';
  c.place = String(c.place).slice(0, 60);
  c.exclude = String(c.exclude).split(',').filter(id => /^[a-z-]{3,40}$/.test(id)).slice(0, 60).join(',');
  return c;
}

// 設定 ↔ 網址 query 字串：只寫跟預設不同的值，網址比較短
export const encodeConfig = c => new URLSearchParams(Object.keys(DEFAULTS).filter(k => c[k] !== DEFAULTS[k]).map(k => [k, c[k]])).toString();
export function decodeConfig(query) {
  const c = { ...DEFAULTS };
  for (const [k, v] of new URLSearchParams(query)) if (k in DEFAULTS) c[k] = v;
  return sanitize(c);
}
