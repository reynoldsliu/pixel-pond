// DOM 小工具：只有 UI 用得到
export const $ = id => document.getElementById(id);

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function flash(btn, text) {
  const old = btn.textContent; btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1500);
}

// 圖 → ImageData（file:// 開啟時會因跨來源被擋 → 丟錯）
export function toPixels(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}
export const fileToPixels = async file => toPixels(await createImageBitmap(file));
export const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

export function pixelsToBlob({ width, height, data }) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return new Promise(ok => c.toBlob(ok));
}

// 檔案輸入選完就清空，同一個檔案才能再選一次
export function onFiles(input, handler) {
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) await handler(files);
  });
}
