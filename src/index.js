// 對外 API（瀏覽器、Node 測試、tools/ 共用）。UI 以外的程式都從這裡拿。
export { PALETTES, COLOR_KEYS, DEFAULTS, LOOP, SKY_LOOP, PHOTO_SKY_LOOP, RANGES, sanitize, encodeConfig, decodeConfig } from './core/config.js';
export { parsePrompt } from './core/prompt.js';
export * as ecology from './core/ecology.js';
export { hex, rng } from './core/color.js';
export { parseAssetName, trimSprite } from './assets/naming.js';
export { pixelate, segment } from './image/pixelate.js';
export { LIB } from './sprites/library.js';
export { buildScene, buildPhotoScene, renderFrame } from './scenes/index.js';
