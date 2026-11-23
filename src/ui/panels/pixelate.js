// 圖片像素化：調滑桿即時重算；預覽套上動態；可加入場景、做成整個動態畫面、下載
import { pixelate, buildPhotoScene } from '../../index.js';
import { $, download, flash, fileToPixels, onFiles, pixelsToBlob } from '../dom.js';
import { t } from '../i18n.js';

const slug = s => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'pixel';

export function mountPixelate(app) {
  let src = null, out = null, name = 'image', count = 0;
  const preview = $('pxPreview');

  const run = () => {
    $('pxWOut').textContent = $('pxW').value; $('pxCOut').textContent = $('pxC').value;
    $('pxMOut').textContent = Math.round($('pxM').value * 100) + '%';
    if (!src) return;
    out = pixelate(src, { width: +$('pxW').value, colors: +$('pxC').value, dither: $('pxDither').checked, margin: +$('pxM').value, removeBg: $('pxBg').checked && $('pxRole').value !== 'terrain-ground' });
    const k = Math.max(1, Math.floor(220 / Math.max(out.width, out.height)));
    preview.width = out.width; preview.height = out.height; preview.style.width = out.width * k + 'px';
    app.stage.previews.set(preview, buildPhotoScene(out, out.width, out.height, app.cfg, { raw: true }));
    $('pxInfo').textContent = t('{w}×{h} px、{n} 色', { w: out.width, h: out.height, n: out.palette.length });
    $('pxAdd').disabled = $('pxSave').disabled = $('pxAnimate').disabled = false;
  };

  onFiles($('pxFile'), async ([f]) => { src = await fileToPixels(f); name = f.name.replace(/\.[^.]+$/, ''); run(); });
  for (const id of ['pxW', 'pxC', 'pxDither', 'pxBg', 'pxM']) $(id).addEventListener('input', e => { e.stopPropagation(); run(); });
  $('pxRole').addEventListener('input', e => {
    e.stopPropagation();
    if ($('pxRole').value === 'terrain-ground') $('pxW').value = app.cfg.width; // 地面底圖預設和畫面一樣寬
    run();
  });
  $('pxSave').onclick = async () => download(await pixelsToBlob(out), `${$('pxRole').value}-${slug(name)}.png`); // 存靜態原圖
  $('pxAdd').onclick = e => {
    if (!out) return;
    app.art.add([[`${$('pxRole').value}-pixel-${++count}.png`, out]]);
    app.cfg.art = 1; app.apply(); flash(e.target, t('已加入 ✓'));
  };
  $('pxAnimate').onclick = () => { // 原圖走風景照流程，變成整個畫面的動態場景
    if (!src) return;
    app.setPhoto(src, name); $('phSection').open = true; app.stage.view.scrollIntoView({ behavior: 'smooth' });
  };
}
