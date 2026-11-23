// 現實同步：免費、免金鑰、支援 CORS 的公開 API。只有使用者按按鈕（或開了「即時同步」）時才連線。
//   Open-Meteo：天氣、海拔、時區（forecast）、去年逐日氣溫與雨量 → 柯本氣候（archive）、地名搜尋（geocoding）
//   GBIF：某物種在某地 100 km 內的實際觀察紀錄筆數
import { ecology } from '../index.js';

const json = url => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
const q = o => new URLSearchParams(o).toString();

export async function fetchWeather(lat, lon) {
  const d = await json('https://api.open-meteo.com/v1/forecast?' + q({ latitude: lat, longitude: lon, current: 'temperature_2m,weather_code,is_day,cloud_cover,precipitation,wind_speed_10m', timezone: 'auto' }));
  const c = d.current;
  return { elev: d.elevation, offset: d.utc_offset_seconds, tz: d.timezone, temp: c.temperature_2m, code: c.weather_code, cloud: c.cloud_cover, precip: c.precipitation, wind: c.wind_speed_10m, at: Date.now() };
}

// 去年一整年的逐日資料 → 12 個月的平均氣溫與總雨量 → 柯本分類
export async function fetchClimate(lat, lon) {
  const y = new Date().getFullYear() - 1;
  const d = await json('https://archive-api.open-meteo.com/v1/archive?' + q({ latitude: lat, longitude: lon, start_date: `${y}-01-01`, end_date: `${y}-12-31`, daily: 'temperature_2m_mean,precipitation_sum', timezone: 'auto' }));
  const temp = Array(12).fill(0), prec = Array(12).fill(0), n = Array(12).fill(0);
  d.daily.time.forEach((day, i) => { const m = +day.slice(5, 7) - 1; temp[m] += d.daily.temperature_2m_mean[i] ?? 0; prec[m] += d.daily.precipitation_sum[i] ?? 0; n[m]++; });
  const t = temp.map((v, m) => v / (n[m] || 1));
  return { temp: t, prec, kp: ecology.koppen(t, prec, lat) };
}

// 地名搜尋（Open-Meteo 只認英文或當地拼法）
export async function searchPlace(name) {
  const d = await json('https://geocoding-api.open-meteo.com/v1/search?' + q({ name, count: 6, language: 'zh' }));
  return (d.results || []).map(r => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}

export async function gbifCount(sci, lat, lon, km = 100) {
  const d = await json('https://api.gbif.org/v1/occurrence/search?' + q({ scientificName: sci, geoDistance: `${lat},${lon},${km}km`, limit: 0 }));
  return d.count;
}

// WMO 天氣代碼 → 中文與畫面效果（漣漪、風）
const WMO = [[0, '晴'], [3, '多雲'], [48, '霧'], [57, '毛毛雨'], [67, '雨'], [77, '雪'], [82, '陣雨'], [86, '陣雪'], [99, '雷雨']];
export const weatherLabel = code => (WMO.find(([max]) => code <= max) || WMO[0])[1];
export function weatherEffect(w) {
  const rain = (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.code >= 95;
  return { ripples: rain ? (w.code >= 63 || w.code >= 81 ? 2 : 1.3) : 0.3, wind: Math.min(3, Math.round(w.wind / 8 * 10) / 10) };
}

export const PRESETS = [
  ['台北', 25.0, 121.5], ['東京', 35.7, 139.7], ['倫敦', 51.5, -0.1], ['紐約', 40.7, -74.0], ['雪梨', -33.9, 151.2],
  ['奈洛比', -1.3, 36.8], ['馬瑙斯（亞馬遜）', -3.1, -60.0], ['開羅', 30.0, 31.2], ['雷克雅維克', 64.1, -21.9], ['開普敦', -33.9, 18.4],
  ['檀香山', 21.3, -157.9], ['奧克蘭', -36.8, 174.8], ['新加坡', 1.3, 103.8], ['鳳凰城', 33.4, -112.1], ['峇里島', -8.4, 115.2],
];

// 地點的當地時間：有天氣資料就用它的時區，否則用經度估
export function localTime(cfg, w) {
  const off = w ? w.offset : Math.round(+cfg.lon / 15) * 3600;
  return new Date(Date.now() + off * 1000);
}

// 依地點推出這一刻的場景設定（不寫回網址）：當地月份 → 季節與物種、太陽高度 → 清晨/黃昏/夜晚配色、即時天氣
export function deriveConfig(cfg, w) {
  if (cfg.lat === '') return cfg;
  const now = localTime(cfg, w), month = cfg.month || now.getUTCMonth() + 1;
  const eco = ecology.ecosystem({ ...cfg, month });
  const d = { ...cfg, ...ecology.ecoPalette(eco, ecology.sunElevation(new Date(), +cfg.lat, +cfg.lon)), month, eco };
  if (cfg.live && w) Object.assign(d, weatherEffect(w));
  return d;
}
