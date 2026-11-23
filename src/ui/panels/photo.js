// 風景照轉換：照片 → 動態像素場景
import { $, fileToPixels, onFiles } from '../dom.js';
import { t } from '../i18n.js';

const OPTION_IDS = ['phColors', 'phStyle', 'phWater', 'phLine', 'phDither', 'phClouds', 'phSway'];

export function mountPhoto(app) {
  app.photoOptions = () => ({
    colors: +$('phColors').value, style: +$('phStyle').value, water: +$('phWater').value, waterline: +$('phLine').value,
    dither: $('phDither').checked, clouds: $('phClouds').checked, sway: $('phSway').checked,
  });
  const outputs = () => {
    $('phColorsOut').textContent = $('phColors').value; $('phStyleOut').textContent = $('phStyle').value;
    $('phWaterOut').textContent = $('phWater').value;
    $('phLineOut').textContent = +$('phLine').value ? Math.round($('phLine').value * 100) + '%' : t('自動');
  };
  for (const id of OPTION_IDS) $(id).addEventListener('input', e => { e.stopPropagation(); outputs(); if (app.photo) app.rebuild(); });
  onFiles($('phFile'), async ([f]) => app.setPhoto(await fileToPixels(f), f.name));
  $('phClear').onclick = $('photoOff').onclick = () => app.setPhoto(null);
  // 直接把照片拖到畫面上 = 選風景照
  const main = app.stage.view.parentElement;
  main.addEventListener('dragover', e => { e.preventDefault(); main.classList.add('drop'); });
  main.addEventListener('dragleave', () => main.classList.remove('drop'));
  main.addEventListener('drop', async e => {
    e.preventDefault(); main.classList.remove('drop');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) app.setPhoto(await fileToPixels(f), f.name);
  });

  app.addEventListener('photo', () => {
    const p = app.photo;
    $('phClear').disabled = !p; $('photoBar').hidden = !p; $('photoName').textContent = p?.name || '';
    if (!p) $('phInfo').textContent = '';
  });
  app.addEventListener('scene', () => {
    const s = app.stage.scene;
    if (s.type !== 'photo') return;
    const n = s.wIdx.length, sky = s.cloud ? t('天空的雲會慢慢飄。') : '';
    $('phInfo').textContent = (n ? t('水面 {p}% 的畫面，套上晃動、亮點、漣漪。', { p: (n / (s.W * s.H) * 100).toFixed(0) }) : t('沒找到水面：調高「水面偵測靈敏度」，或把「水線位置」拉到水面上緣。')) + sky;
  });
}
