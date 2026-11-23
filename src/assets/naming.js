// ---------- 素材圖 ----------
// 檔名規則：<分類>-<用途>-<名字>.png
//   分類 flora 花草樹木（會隨風擺）/ rock 石頭 / prop 人造物 / terrain 地面底圖
//   用途 back 池塘後方（有倒影）/ ground 散在草地 / shore 岸邊水線上（有接觸亮線）/ water 立在水中 / feature 地標（遺跡、火堆、工具）
export const ASSET_RE = /^(flora|rock|prop|terrain)-(back|ground|shore|water|feature)-([a-z0-9-]+)\.(png|webp|gif)$/;
export function parseAssetName(file) {
  const m = ASSET_RE.exec(String(file).split('/').pop().toLowerCase());
  return m && { category: m[1], role: m[2], name: m[3] };
}
// 裁掉透明邊（底邊中央 = 樹根），半透明二值化：像素畫不要半透明毛邊。輸入是 ImageData 形狀 {width, height, data}
export function trimSprite({ width: w, height: h, data }) {
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 127) {
    if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  if (x2 < 0) return null;
  const sw = x2 - x1 + 1, sh = y2 - y1 + 1, px = new Uint8ClampedArray(sw * sh * 4);
  for (let r = 0; r < sh; r++) px.set(data.subarray(((y1 + r) * w + x1) * 4, ((y1 + r) * w + x2 + 1) * 4), r * sw * 4);
  for (let o = 3; o < px.length; o += 4) px[o] = px[o] > 127 ? 255 : 0;
  return { w: sw, h: sh, px };
}
