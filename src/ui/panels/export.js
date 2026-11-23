// 輸出：桌布網址、PNG、無縫循環影片
import { $, download, flash } from '../dom.js';
import { t } from '../i18n.js';

const VIDEO_TYPES = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export function mountExport(app) {
  const view = app.stage.view;
  $('copy').onclick = e => {
    $('wpUrl').select();
    navigator.clipboard?.writeText(app.wallpaperUrl()).then(() => flash(e.target, t('已複製 ✓')), () => flash(e.target, t('請按 ⌘C')));
  };
  $('openWp').onclick = () => open(app.wallpaperUrl(), '_blank');
  $('png').onclick = () => view.toBlob(b => download(b, `pixel-pond-${app.cfg.seed}.png`));
  $('rec').onclick = e => {
    const type = VIDEO_TYPES.find(t => window.MediaRecorder?.isTypeSupported(t)), btn = e.target;
    if (!type) return flash(btn, t('瀏覽器不支援'));
    const rec = new MediaRecorder(view.captureStream(app.cfg.fps), { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = ev => chunks.push(ev.data);
    rec.onstop = () => {
      download(new Blob(chunks, { type }), `pixel-pond-${app.cfg.seed}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
      btn.disabled = false; btn.textContent = t('錄影片');
    };
    // 錄整數個完整循環，影片頭尾才接得起來
    const period = app.stage.scene.period / app.cfg.speed, want = Math.min(60, Math.max(2, +$('recSec').value || 10));
    const sec = period * Math.max(1, Math.round(want / period));
    rec.start(); btn.disabled = true; btn.textContent = t('錄影中…（{n} 秒）', { n: Math.round(sec) });
    setTimeout(() => rec.stop(), sec * 1000);
  };
  app.addEventListener('config', () => { $('wpUrl').value = app.wallpaperUrl(); });
}
