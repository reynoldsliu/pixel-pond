// 場景與水面控制項：步驟、地標、配色、顏色、滑桿、一句話描述、換場景、重設
import { PALETTES, DEFAULTS, RANGES, parsePrompt } from '../../index.js';
import { $ } from '../dom.js';
import { t } from '../i18n.js';

const STEP_UI = [
  '依離岸距離調水色：岸淺、池心深',
  '提亮靠近觀眾的半邊，讓天空映進來',
  '樹影：倒過來、壓扁、每行錯開一兩像素',
  '岸邊淺綠、濕泥壓暗、浪頭短亮線',
  '對岸泥土和草的倒影、水線輕輕挪動',
  '漣漪、偶爾一閃的亮點、落葉、荷葉浮動',
];
const PROP_UI = [['p', '小徑'], ['r', '遺跡'], ['f', '火堆'], ['t', '遺落工具']];
const PALETTE_NAMES = { forest: '森林（範例）', day: '白天', sunset: '黃昏', night: '夜晚', autumn: '秋天', sakura: '櫻花' };
const COLOR_UI = [['sky', '天空'], ['shallow', '淺水'], ['deep', '深水'], ['grass', '草地'], ['foliage', '樹葉']];
// key, 標籤, step, 面板分組（min/max 來自 RANGES）
const SLIDERS = [
  ['horizon', '天空比例（0 = 俯瞰全是地面）', 0.01, 'scene'],
  ['pond', '池塘大小', 0.05, 'scene'],
  ['trees', '樹木數量', 1, 'scene'],
  ['decor', '花草、蘆葦、石頭密度', 0.1, 'scene'],
  ['fauna', '水生動物（魚、錦鯉、鴨子、青蛙）', 0.5, 'scene'],
  ['lilies', '荷葉數量', 1, 'scene'],
  ['birds', '鳥類數量（跳、飛、涉水、潛水，依地點與水域隨機）', 1, 'scene'],
  ['wind', '風力（樹與花草擺動）', 0.1, 'water'],
  ['speed', '動畫速度', 0.1, 'water'],
  ['wobble', '倒影晃動（像素）', 0.5, 'water'],
  ['depth', '深淺漸層範圍', 1, 'water'],
  ['ripples', '漣漪頻率', 0.1, 'water'],
  ['sparkles', '波光閃爍', 0.1, 'water'],
  ['leaves', '落葉數量', 1, 'water'],
  ['artSize', '素材圖大小', 0.1, 'art'],
  ['width', '解析度（像素寬，越小越粗）', 16, 'out'],
  ['fps', 'FPS 上限（桌布建議 12–24 省電）', 1, 'out'],
];
const HINT = '沒認出關鍵字，試試：黃昏、夜晚、秋天、櫻花、下雨、起風、平靜、森林、荷葉、大／小、波光、深水、花、荒涼、遺跡、火堆、工具';

export function mountControls(app) {
  const add = (el, html) => el.insertAdjacentHTML('beforeend', html);
  STEP_UI.forEach((label, k) => add($('steps'), `<label><input type="checkbox" data-step="${k + 1}"> <span>${k + 1}. <span>${t(label)}</span></span></label>`));
  PROP_UI.forEach(([k, label]) => add($('props'), `<label><input type="checkbox" data-prop="${k}"> ${t(label)}</label>`));
  for (const name in PALETTES) $('palette').add(new Option(t(PALETTE_NAMES[name] || name), name));
  COLOR_UI.forEach(([k, label]) => add($('colors'), `<label>${t(label)}<input type="color" data-key="${k}"></label>`));
  SLIDERS.forEach(([k, label, step, group]) => add(document.querySelector(`[data-sliders="${group}"]`),
    `<label>${t(label)} <output data-out="${k}"></output><input type="range" data-key="${k}" min="${RANGES[k][0]}" max="${RANGES[k][1]}" step="${step}"></label>`));

  // 所有 data-* 控制項用同一個事件委派；各面板自己的輸入會 stopPropagation
  $('panel').addEventListener('input', e => {
    const el = e.target, cfg = app.cfg;
    if (el.dataset.step) cfg.steps = [...document.querySelectorAll('[data-step]:checked')].map(c => c.dataset.step).join('');
    else if (el.dataset.prop) cfg.props = [...document.querySelectorAll('[data-prop]:checked')].map(c => c.dataset.prop).join('');
    else if (el.dataset.key) cfg[el.dataset.key] = el.type === 'range' ? +el.value : el.value;
    else if (el.id === 'palette') Object.assign(cfg, PALETTES[el.value], { palette: el.value });
    else if (el.id === 'seed') cfg.seed = +el.value;
    else if (el.id === 'art') cfg.art = el.checked ? 1 : 0;
    else return;
    app.apply();
  });

  let understood = null; // 上一次「套用描述」認出的關鍵字（切換語言時重畫）
  const showUnderstood = () => {
    if (understood) $('understood').textContent = understood.length ? t('理解到：') + understood.map(m => t(m)).join(t('、')) : t(HINT);
  };
  addEventListener('langchange', showUnderstood);
  $('prompt').value = app.cfg.prompt;
  $('applyPrompt').onclick = () => {
    const text = $('prompt').value, { patch, matched } = parsePrompt(text);
    understood = matched;
    Object.assign(app.cfg, patch, { prompt: text });
    showUnderstood();
    app.apply();
  };
  $('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('applyPrompt').click(); });
  $('compare').onclick = () => { app.cfg.steps = app.cfg.steps ? '' : '123456'; app.apply(); };
  $('dice').onclick = () => { app.cfg.seed = Math.floor(Math.random() * 1e5); app.apply(); };
  $('reset').onclick = () => { app.cfg = { ...DEFAULTS }; $('prompt').value = ''; app.apply(); };

  app.addEventListener('config', () => {
    const cfg = app.cfg;
    document.querySelectorAll('[data-step]').forEach(el => { el.checked = cfg.steps.includes(el.dataset.step); });
    document.querySelectorAll('[data-prop]').forEach(el => { el.checked = cfg.props.includes(el.dataset.prop); });
    document.querySelectorAll('[data-key]').forEach(el => { el.value = cfg[el.dataset.key]; });
    document.querySelectorAll('[data-out]').forEach(el => { el.textContent = cfg[el.dataset.out]; });
    $('palette').value = cfg.palette;
    $('art').checked = !!cfg.art;
    $('seed').value = cfg.seed;
  });
}
