// 場景 = build(輸入) → 純資料；render(scene, out, time) 只依時間畫一格。
// 新增一種場景：寫一對 build/render，在 RENDERERS 登記 type 即可，不用改既有場景（開放封閉）。
import { renderPond } from './pond/index.js';
import { renderPhoto } from './photo.js';

export { buildScene } from './pond/index.js';
export { buildPhotoScene } from './photo.js';

const RENDERERS = { pond: renderPond, photo: renderPhoto };

export function renderFrame(scene, out, time) {
  const render = RENDERERS[scene.type];
  if (!render) throw new Error(`unknown scene type: ${scene.type}`);
  render(scene, out, time);
}
