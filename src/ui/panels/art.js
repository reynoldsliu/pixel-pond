// 素材圖：上傳、復原、清除、狀態文字
import { $, fileToPixels, onFiles } from '../dom.js';
import { t } from '../i18n.js';

const ROLE_NAMES = { back: '後方樹木', ground: '地面花草石', shore: '岸邊', water: '水中', feature: '地標' };

async function read(files, rename) {
  const out = [];
  for (const f of files) try { out.push([rename || f.name, await fileToPixels(f)]); } catch { /* 不是圖片就略過 */ }
  return out;
}

export function mountArt(app) {
  const lib = app.art;
  onFiles($('upTrees'), async files => { lib.add(await read(files), { replace: true }); app.cfg.art = 1; app.apply(); });
  onFiles($('upGround'), async files => { lib.add(await read(files.slice(0, 1), 'terrain-ground-upload.png')); app.cfg.art = 1; app.apply(); });
  $('artUndo').onclick = () => lib.undo();
  $('artClear').onclick = () => lib.resetToFolder();

  const status = () => {
    const { items, ground, from } = lib.current, count = {};
    for (const it of items) count[it.role] = (count[it.role] || 0) + 1;
    const parts = Object.entries(count).map(([r, n]) => `${t(ROLE_NAMES[r])} ${n}`);
    if (ground) parts.push(t('地面底圖'));
    $('artStatus').textContent = parts.length ? t('目前素材（{from}）：{parts}；其餘用程式畫', { from: from.split(' + ').map(f => t(f)).join(' + '), parts: parts.join(t('、')) })
      : location.protocol === 'file:' ? t('用 npm run dev 開啟才讀得到 assets/ 資料夾；或直接上傳。')
      : t('沒有素材圖，全部用程式畫。');
    $('artUndo').disabled = !lib.canUndo;
  };
  lib.addEventListener('change', status);
  addEventListener('langchange', status);
  status();
}
