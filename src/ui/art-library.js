// 素材圖集合：assets/ 資料夾（桌布用）＋ 上傳（只在這個分頁）。
// 每次改動都產生一份新的不可變快照，「復原」只是換回上一份。
import { parseAssetName, trimSprite } from '../index.js';
import { toPixels, loadImg } from './dom.js';

const EMPTY = Object.freeze({ items: [], ground: null, from: '' });

// 依檔名分類放進素材集合（回傳新的集合）；不符合命名規則的圖當成「後方樹木」
export function withArt(art, fileName, pixels) {
  const meta = parseAssetName(fileName) || { category: 'flora', role: 'back', name: 'upload' };
  if (meta.category === 'terrain') return { ...art, ground: { w: pixels.width, h: pixels.height, px: pixels.data } };
  const sprite = trimSprite(pixels);
  return sprite ? { ...art, items: [...art.items, { ...meta, sprite }] } : art;
}

// 瀏覽器不能列資料夾 → 讀 npm run assets 產生的 assets/manifest.json
export async function loadFolder() {
  let art = EMPTY, files = [];
  try { files = (await (await fetch('assets/manifest.json')).json()).files || []; } catch { return art; }
  for (const f of files) {
    if (!parseAssetName(f) || String(f).includes('..')) continue; // 允許子資料夾，不允許跳出 assets/
    try { art = withArt(art, f, toPixels(await loadImg('assets/' + f))); } catch { /* 單張壞圖略過 */ }
  }
  return { ...art, from: art.items.length || art.ground ? 'assets/ 資料夾' : '' };
}

export class ArtLibrary extends EventTarget {
  current = EMPTY;
  #folder = EMPTY;
  #history = [];

  get canUndo() { return this.#history.length > 0; }
  get isEmpty() { return !this.current.items.length && !this.current.ground; }

  setFolder(art) { this.#folder = art; this.current = art; this.#emit(); }

  // entries: [[檔名, ImageData], ...]；replace = 先清掉目前的物件（地面底圖保留）
  add(entries, { replace = false } = {}) {
    let next = replace ? { ...EMPTY, ground: this.current.ground } : this.current;
    for (const [name, px] of entries) next = withArt(next, name, px);
    const from = this.current.from && this.current.from !== '上傳' && !replace ? this.current.from + ' + 上傳' : '上傳';
    this.#commit({ ...next, from });
  }
  undo() { if (this.canUndo) { this.current = this.#history.pop(); this.#emit(); } }
  resetToFolder() { this.#commit(this.#folder); }

  #commit(next) { this.#history.push(this.current); this.current = next; this.#emit(); }
  #emit() { this.dispatchEvent(new Event('change')); }
}
