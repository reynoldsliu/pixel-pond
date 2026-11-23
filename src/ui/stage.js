// 舞台：一張低解析度的緩衝畫布，整數倍放大到顯示畫布；依 fps 上限逐格呼叫 renderFrame。
// 額外的小預覽（例如像素化預覽）登記到 previews，同一個動畫迴圈一起畫。
import { renderFrame } from '../index.js';

export class Stage {
  previews = new Map(); // canvas → scene
  #buf = document.createElement('canvas');
  #bctx = this.#buf.getContext('2d');
  #img = null;
  #last = 0;

  constructor(view, getFps) {
    this.view = view; this.vctx = view.getContext('2d'); this.getFps = getFps;
  }

  show(scene, scale) {
    this.scene = scene;
    this.#buf.width = scene.W; this.#buf.height = scene.H;
    this.#img = this.#bctx.createImageData(scene.W, scene.H);
    this.view.width = scene.W * scale; this.view.height = scene.H * scale;
  }

  start() {
    const tick = now => {
      requestAnimationFrame(tick);
      if (!this.scene || now - this.#last < 1000 / this.getFps() - 1) return;
      this.#last = now;
      this.#draw(now / 1000);
    };
    requestAnimationFrame(tick);
  }

  #draw(t) {
    renderFrame(this.scene, this.#img.data, t);
    this.#bctx.putImageData(this.#img, 0, 0);
    this.vctx.imageSmoothingEnabled = false;
    this.vctx.drawImage(this.#buf, 0, 0, this.view.width, this.view.height);
    for (const [canvas, scene] of this.previews) {
      const p = new ImageData(scene.W, scene.H);
      renderFrame(scene, p.data, t);
      canvas.getContext('2d').putImageData(p, 0, 0);
    }
  }
}
