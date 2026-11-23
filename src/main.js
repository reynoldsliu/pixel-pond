// 進入點：組裝 App（狀態 + 事件），再把各面板掛上去。面板之間不互相引用，只透過 app 溝通。
// 所有設定都在網址 hash 裡，所以「分享」和「設成桌布」都只是一條 URL。
import { sanitize, encodeConfig, decodeConfig, buildScene, buildPhotoScene } from './index.js';
import { $ } from './ui/dom.js';
import { ArtLibrary, loadFolder } from './ui/art-library.js';
import { Stage } from './ui/stage.js';
import { mountControls } from './ui/panels/controls.js';
import { mountArt } from './ui/panels/art.js';
import { mountPhoto } from './ui/panels/photo.js';
import { mountPixelate } from './ui/panels/pixelate.js';
import { mountExport } from './ui/panels/export.js';
import { mountRegion } from './ui/panels/region.js';
import { deriveConfig, fetchWeather } from './ui/realworld.js';
import { lang, setLang, translateDom } from './ui/i18n.js';

// 事件：config（設定變了）、scene（場景重建了）、photo（照片換了）
class App extends EventTarget {
  cfg = decodeConfig(location.hash.slice(1));
  art = new ArtLibrary();
  photo = null; // { pixels, name }：只在這個分頁
  photoOptions = () => ({});
  weather = null; // 最近一次的即時天氣（Open-Meteo），只在記憶體裡
  wallpaper = new URLSearchParams(location.hash.slice(1)).has('wp');
  stage = new Stage($('view'), () => this.cfg.fps);

  apply() {
    sanitize(this.cfg);
    if (!this.wallpaper) history.replaceState(null, '', '#' + encodeConfig(this.cfg));
    this.#emit('config');
    this.rebuild();
  }

  rebuild() {
    const { cfg, wallpaper } = this, W = cfg.width, H = Math.round(W * (wallpaper ? innerHeight / innerWidth : 9 / 16));
    const scene = this.photo ? buildPhotoScene(this.photo.pixels, W, H, cfg, this.photoOptions())
      : buildScene(deriveConfig(cfg, this.weather), W, H, cfg.art && !this.art.isEmpty ? this.art.current : null);
    this.stage.show(scene, Math.ceil((wallpaper ? innerWidth * devicePixelRatio : 1920) / W)); // 整數倍放大
    this.#emit('scene');
  }

  setPhoto(pixels, name = '') {
    this.photo = pixels ? { pixels, name } : null;
    this.#emit('photo');
    this.rebuild();
  }

  wallpaperUrl() {
    return location.href.split('#')[0] + '#' + [encodeConfig(this.cfg), 'wp=1'].filter(Boolean).join('&');
  }

  // 即時同步：每 10 分鐘重抓天氣、重算太陽高度與季節（桌布模式也會跑）
  async sync() {
    const { cfg } = this;
    if (cfg.lat === '' || !cfg.live) return;
    try { this.weather = await fetchWeather(cfg.lat, cfg.lon); } catch { /* 離線就沿用上一次 */ }
    this.rebuild();
  }

  // 換語言：面板的動態文字（地點摘要、物種清單、素材狀態…）都在這些事件裡重畫
  refreshText() { this.#emit('config'); this.#emit('scene'); this.#emit('photo'); }

  #emit(type) { this.dispatchEvent(new Event(type)); }
}

const app = new App();
globalThis.pixelPond = app; // 方便在主控台除錯
document.body.classList.toggle('wp', app.wallpaper);
addEventListener('hashchange', () => location.reload()); // 手動改網址時重讀設定（replaceState 不會觸發）

if (app.wallpaper) addEventListener('resize', () => app.rebuild());
else {
  translateDom();
  const langBtn = () => { $('lang').textContent = lang === 'en' ? '中文' : 'English'; };
  langBtn();
  $('lang').onclick = () => setLang(lang === 'en' ? 'zh' : 'en');
  addEventListener('langchange', () => { langBtn(); app.refreshText(); });
  [mountControls, mountRegion, mountArt, mountPhoto, mountPixelate, mountExport].forEach(mount => mount(app));
}

app.apply();
app.stage.start();
app.sync();
setInterval(() => app.sync(), 10 * 60e3);
app.art.addEventListener('change', () => app.rebuild());
loadFolder().then(a => app.art.setFolder(a));
