// 鳥：物種來自生態系（eco.birds），行為依類型（kind）從它做得到的動作裡隨機挑，再依地圖找得到的位置過濾。
// 例：蒼鷺可能在淺水邊涉水、或站著等一下突然啄魚；海鷗可能在天上盤旋、站在沙灘、或浮在海上。
// 動作都在 LOOP 裡跑整數圈；橫越畫面的滑翔用 S.period（有天空時 60 秒），循環一樣沒有接縫。
import { hex, shade } from '../../core/color.js';
import { LOOP, SKY_LOOP } from '../../core/config.js';
import { TAU, phase } from '../../core/math.js';

// 圖例：m 主色、s 次色（多半是腹部）、a 點綴色、k 眼睛、b 喙、l 腳；. 透明。全部面向右，錨點在最後一列的中間
const F = {
  perch: ['...mm.', '..mmkb', 'mmmss.', '.mss..', '..l...'],
  peck: ['......', '......', 'mmmmm.', '.mssmk', '..l..b'],
  crow: ['.....mm.', '....mmkb', 'mmmmmmm.', '.mmmmm..', '..mmm...', '...l....'],
  crowPeck: ['........', '........', 'mmmmmm..', '.mmmmmmk', '..mmm..b', '...l....'],
  heron: ['...ak...', '...mmbbb', '...s....', '...s....', '..ss....', '.mmmm...', 'mmmmmm..', '.mmmmm..', '..l.l...', '..l.l...', '..l.l...'],
  heronStrike: ['........', '........', '........', '.....mk.', '....s..bb', '.mmms....', 'mmmmmm...', '.mmmmm...', '..l.l....', '..l.l....', '..l.l....'],
  kingfisher: ['..mm...', '.mmkbb.', '.ss....', '.ss....', '..l....'],
  kingDive: ['.m.', 'mm.', 'mm.', '.b.'],
  wingUp: ['a.....a', '.m...m.', '..msb..'],
  wingDown: ['..msb..', '.m...m.', 'a.....a'],
  bigGlide: ['aa.......aa', '.mmm.s.mmm.', '...mmmmmb..', '.....m.....'],
  bigFlap: ['....msb....', '.mmm.m.mmm.', 'aa.......aa'],
  tinyUp: ['m...m', '.msb.'],
  tinyDown: ['.msb.', 'm...m'],
  gullStand: ['...sk.', '...ssb', 'ammms.', '..mss.', '...l..'],
  gullFloat: ['...sk.', '...ssb', 'ammmss'],
  cormorant: ['...mkb', '...m..', '...m..', 'mmmmm.'],
  pelican: ['....mm....', '....mkbbbb', '....m.bbb.', '.mmmmm....', 'mmmmmmm...'],
  shorebird: ['..mk.', '..mmb', 'mmms.', '.ss..', '.l...'],
  shoreRun: ['..mk.', '..mmb', 'mmms.', '.ss..', 'l..l.'],
  penguin: ['.mm.', '.mkb', 'mms.', 'mms.', 'mms.', '.ll.'],
  penguinStep: ['.mm.', '.mkb', 'mms.', 'mms.', 'mms.', 'l..l'],
};

// 每種類型：喙、腳的顏色，與做得到的行為
const ARCH = {
  sparrow: { b: [70, 56, 44], l: [176, 130, 96], acts: ['hop', 'peck'] },
  crow: { b: [24, 24, 28], l: [30, 30, 34], acts: ['hop', 'peck', 'glide'] },
  heron: { b: [214, 180, 60], l: [44, 44, 48], acts: ['wade', 'strike', 'glide'] },
  kingfisher: { b: [30, 30, 30], l: [214, 100, 70], acts: ['perch', 'dive'] },
  swallow: { b: [20, 20, 20], l: [20, 20, 20], acts: ['skim'] },
  raptor: { b: [70, 70, 70], l: [214, 190, 80], acts: ['soar'] },
  gull: { b: [226, 196, 70], l: [214, 150, 110], acts: ['soar', 'stand', 'float'] },
  cormorant: { b: [200, 170, 110], l: [30, 30, 30], acts: ['float', 'dive'] },
  pelican: { b: null, l: [120, 110, 100], acts: ['float', 'glide'] },
  shorebird: { b: [24, 24, 24], l: [30, 30, 30], acts: ['run'] },
  penguin: { b: [30, 30, 30], l: [216, 130, 130], acts: ['waddle'] },
};

export function buildBirds(G) {
  const { cfg, eco, W, H, s, R, hz, GH, water, distW, distL, depth, isFarWater, pickWater, wIdx, habitat } = G;
  const birds = [], n = Math.round((cfg.birds ?? 1) * (2 + R() * 2));
  if (!eco.birds.length || !n) return { birds };
  const landSpot = (lo, hi) => { for (let k = 0; k < 200; k++) { const x = 8 + ((R() * (W - 16)) | 0), y = (hz + 4 + R() * (GH - 6)) | 0, i = y * W + x; if (!water[i] && distL[i] >= lo && distL[i] <= hi) return [x, y]; } return null; };
  const shallow = () => { const i = pickWater(i => distW[i] >= 1.5 && distW[i] <= 4 * s && !isFarWater(i) && (i / W | 0) > hz + 3); return i < 0 ? null : [i % W, (i / W) | 0]; };
  const open = () => { const i = pickWater(i => depth[i] >= 6 * s && (i / W | 0) > hz + GH * 0.1); return i < 0 ? null : [i % W, (i / W) | 0]; };
  const sky = () => [W * (0.15 + R() * 0.7), hz >= 16 ? hz * (0.25 + R() * 0.45) : H * (0.1 + R() * 0.3)];
  const sandEdge = () => { // 海岸：每欄的水線就是沙灘的起點
    if (habitat !== 'coast') return null;
    for (let k = 0; k < 60; k++) { const x = 6 + ((R() * (W - 12)) | 0); let y = hz + 1; while (y < H && water[y * W + x]) y++; if (y < H - 6) return [x, y]; }
    return null;
  };
  const SPOT = {
    hop: () => landSpot(4 * s, 1e9), peck: () => landSpot(4 * s, 1e9), waddle: () => landSpot(2 * s, 10 * s),
    wade: shallow, strike: shallow, float: open, dive: open,
    perch: () => landSpot(1, 3 * s), stand: () => habitat === 'coast' ? landSpot(3 * s, 12 * s) : null,
    run: sandEdge, soar: sky, glide: sky, skim: () => (wIdx.length > W * 4 ? open() : null),
  };
  const pick = a => a[(R() * a.length) | 0];
  for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
    const sp = pick(eco.birds), type = sp.kind.split(':')[1], A = ARCH[type];
    if (!A) continue;
    let act = pick(A.acts);
    if (habitat === 'ocean' && !['soar', 'float', 'dive', 'glide'].includes(act)) continue;
    const at = type === 'kingfisher' ? SPOT.perch() : SPOT[act]();
    if (!at) continue;
    const col = (sp.color || ['#6a6a6a', '#d0d0d0', '#303030']).map(hex);
    birds.push({ species: sp.id, type, act, x: Math.round(at[0]), y: Math.round(at[1]), ph: R() * TAU, dir: R() < 0.5 ? 1 : -1,
      range: Math.round((6 + R() * 10) * s), cycles: 1 + ((R() * 2) | 0), slot: R(),
      P: { m: col[0], s: col[1], a: col[2], k: [20, 20, 22], b: A.b || col[2], l: A.l } });
    k++;
  }
  return { birds };
}

// ---------- 每幀 ----------
const tri = u => 1 - Math.abs(((u % 1) + 1) % 1 * 2 - 1); // 0 → 1 → 0
const inWin = (u, a, b) => u >= a && u < b;

// 回傳這一幀：位置、朝向、圖、要不要畫，以及要在水面留下的漣漪
function poseAt(S, b, t, time) {
  const u = ((t / LOOP) * b.cycles + b.ph / TAU) % 1, { s, W, hz, H } = S;
  let x = b.x, y = b.y, face = b.dir, frame = 'perch', ring = null, hide = false;
  switch (b.act) {
    case 'hop': case 'peck': case 'waddle': { // 跳 3 下、停下來啄、再跳回來
      const N = 6, h = Math.floor(u * N), f = u * N - h, st = k => (k <= N / 2 ? k : N - k), step = b.range / (N / 2);
      const k0 = st(h), k1 = st(h + 1), mv = Math.min(1, f / 0.35);
      x = b.x + b.dir * step * (k0 + (k1 - k0) * mv);
      face = (k1 - k0 || 1) * b.dir;
      const walk = b.act === 'waddle';
      if (!walk) y = b.y - (f < 0.35 ? Math.round(2 * Math.sin(Math.PI * f / 0.35)) : 0);
      const pecking = !walk && (inWin(f, 0.5, 0.65) || (b.act === 'peck' && inWin(f, 0.75, 0.9)));
      frame = walk ? (f < 0.35 && Math.floor(f * 8) % 2 ? 'penguinStep' : 'penguin') : b.type === 'crow' ? (pecking ? 'crowPeck' : 'crow') : pecking ? 'peck' : 'perch';
      break;
    }
    case 'wade': case 'strike': { // 慢慢走兩步，strike 會在一個窗口突然低頭啄
      x = b.x + Math.round(Math.sin(TAU * u) * (b.act === 'wade' ? 3 * s : s));
      face = Math.cos(TAU * u) >= 0 ? b.dir : -b.dir;
      frame = b.act === 'strike' && inWin(u, 0.6, 0.7) ? 'heronStrike' : 'heron';
      if (b.act === 'strike' && inWin(u, 0.65, 0.85)) ring = { x: x + face * 5, y, r: 1 + (u - 0.65) * 20 * s };
      else if (Math.floor(u * 8) % 4 === 0) ring = { x, y, r: 2 * s };
      break;
    }
    case 'perch': frame = 'kingfisher'; face = inWin(u, 0.4, 0.7) ? -b.dir : b.dir; break; // 停著東張西望
    case 'dive': {
      if (b.type === 'kingfisher') break; // 翠鳥的俯衝在下面
      // 鸕鷀潛水：一段時間不見，再從旁邊冒出來
      const gone = inWin(u, 0.35, 0.7);
      hide = gone; x = b.x + (u >= 0.7 ? b.dir * 6 * s : 0);
      frame = 'cormorant';
      if (inWin(u, 0.35, 0.45)) ring = { x: b.x, y, r: 1 + (u - 0.35) * 30 * s };
      if (inWin(u, 0.7, 0.8)) ring = { x, y, r: 1 + (u - 0.7) * 30 * s };
      break;
    }
    case 'float': {
      x = b.x + Math.round(Math.sin(TAU * u) * 4 * s); face = Math.cos(TAU * u) >= 0 ? b.dir : -b.dir;
      y = b.y + (Math.sin(phase(t, 3) + b.ph) > 0.5 ? 1 : 0);
      frame = b.type === 'pelican' ? 'pelican' : b.type === 'gull' ? 'gullFloat' : 'cormorant';
      break;
    }
    case 'stand': frame = 'gullStand'; face = inWin(u, 0.5, 0.8) ? -b.dir : b.dir; break;
    case 'run': { // 追著浪跑：浪打上來就往後跑，退下去又跟著往前
      const w = (t / LOOP * 2) % 1, reach = w < 0.55 ? 0 : 6 * s * Math.sin(Math.PI * (w - 0.55) / 0.45);
      const off = Math.max(2 * s, reach + 2 * s);
      y = b.y + Math.round(off); x = b.x + Math.round(Math.sin(TAU * u) * 2 * s);
      frame = reach > 0.5 && Math.floor(t * 10) % 2 ? 'shoreRun' : 'shorebird'; face = b.dir;
      break;
    }
    case 'soar': { // 繞大圈，偶爾拍幾下翅膀
      const big = b.type === 'raptor';
      const a = phase(t, 1) * b.dir + b.ph, r = (big ? 26 : 18) * s;
      x = b.x + Math.cos(a) * r; y = b.y + Math.sin(a) * r * 0.35; face = -Math.sin(a) * b.dir >= 0 ? 1 : -1;
      const flap = Math.sin(phase(t, 4) + b.ph) > 0.6 && Math.floor(t * 8) % 2;
      frame = big ? (flap ? 'bigFlap' : 'bigGlide') : flap ? 'wingDown' : 'wingUp';
      break;
    }
    case 'glide': { // 橫越畫面：有天空時一分鐘飛過一次
      const P = S.hz ? SKY_LOOP : LOOP, tt = ((time * S.cfg.speed % P) + P) % P, v = (tt / P + b.slot) % 1;
      x = b.dir > 0 ? -20 + v * (W + 40) : W + 20 - v * (W + 40); y = b.y + Math.sin(TAU * v * 3) * 2 * s; face = b.dir;
      const flap = Math.floor(tt * 3) % 3 === 0;
      frame = b.type === 'crow' ? (flap ? 'wingDown' : 'wingUp') : flap ? 'bigFlap' : 'bigGlide';
      break;
    }
    case 'skim': { // 燕子貼著水面飛 8 字，翅膀快速開合
      const a = phase(t, 2) * b.dir + b.ph, ax = Math.min(W * 0.3, 40 * s), ay = 6 * s;
      x = b.x + Math.sin(a) * ax; y = b.y - 4 * s + Math.sin(2 * a) * ay; face = Math.cos(a) * b.dir >= 0 ? 1 : -1;
      frame = Math.floor(t * 12) % 2 ? 'tinyUp' : 'tinyDown';
      if (Math.sin(2 * a) > 0.97) ring = { x, y: y + 1, r: s };
      break;
    }
  }
  if (b.type === 'kingfisher' && b.act === 'dive') { // 翠鳥：從岸邊衝進水裡，濺起水花，再飛回來
    const tx = b.x + b.dir * 10 * s, ty = b.y + 4 * s;
    if (inWin(u, 0.5, 0.6)) { const q = (u - 0.5) / 0.1; x = b.x + (tx - b.x) * q; y = b.y + (ty - b.y) * q * q; frame = 'kingDive'; }
    else if (inWin(u, 0.6, 0.7)) { hide = true; ring = { x: tx, y: ty, r: 1 + (u - 0.6) * 30 * s }; }
    else if (inWin(u, 0.7, 0.8)) { const q = (u - 0.7) / 0.1; x = tx + (b.x - tx) * q; y = ty + (b.y - ty) * q; frame = 'tinyUp'; face = -b.dir; }
    else { frame = 'kingfisher'; face = b.dir; }
  }
  return { x: Math.round(x), y: Math.round(y), face, frame, ring, hide, inSky: y < hz || y > H };
}

// 色號階段：水面漣漪（涉水、潛水、啄魚、燕子點水）
export function toneBirds(S, { t, time, put }) {
  if (!S.birds) return;
  for (const b of S.birds) {
    const { ring } = poseAt(S, b, t, time);
    if (!ring) continue;
    for (let a = 0; a < TAU; a += 0.35) put(Math.round(ring.x + Math.cos(a) * ring.r), Math.round(ring.y + Math.sin(a) * ring.r * 0.4), 5);
  }
}

export function paintBirds(S, out, { t, time, pset }) {
  if (!S.birds) return;
  for (const b of S.birds) {
    const p = poseAt(S, b, t, time);
    if (p.hide) continue;
    const rows = F[p.frame], h = rows.length, cx = (rows[0].length / 2) | 0;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const col = b.P[ch];
      if (!col) return;
      pset(p.x + p.face * (c - cx), p.y - (h - 1) + r, shade(col, 1.06 - r * 0.02).map(Math.round));
    }));
  }
}
