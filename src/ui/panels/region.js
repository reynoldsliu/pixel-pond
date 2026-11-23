// 地區與生態：選地點（定位 / 常用 / 搜尋）→ 抓海拔、天氣、氣候 → 場景依當地生態重建；列出畫面裡每個物種與它出現的理由
import { ecology } from '../../index.js';
import { $, flash } from '../dom.js';
import { t } from '../i18n.js';
import { PRESETS, fetchClimate, fetchWeather, gbifCount, localTime, searchPlace, weatherLabel } from '../realworld.js';

const { REALMS, CLIMATES, SEASONS, speciesById, ecosystem } = ecology;
const ACT = { hop: '在地上跳', peck: '跳著覓食', glide: '飛過天空', wade: '在淺水涉水', strike: '站著等魚、突然啄下', perch: '停在岸邊', dive: '潛水捕魚', skim: '貼著水面飛', soar: '在空中盤旋', stand: '站在沙灘上', float: '浮在水面', run: '追著浪跑', waddle: '在沙灘上走' };
const short = s => t(s).split(/[（(]/)[0].trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountRegion(app) {
  const gbif = new Map(); // 學名 → 100 km 內的觀察筆數（這個地點）
  const info = text => { $('geoInfo').textContent = text; };
  const months = () => { for (let m = 1; m <= 12; m++) { const o = $('month').options[m] || $('month').appendChild(new Option('', m)); o.text = t('{m} 月', { m }); } };
  months();
  addEventListener('langchange', months);
  PRESETS.forEach(([name], k) => $('geoPreset').add(new Option(t(name), k)));

  async function setPlace(lat, lon, place) {
    info(t('讀取 {place} 的海拔、天氣與去年一整年的氣候…', { place }));
    gbif.clear();
    const cfg = app.cfg;
    try {
      const [w, c] = await Promise.all([fetchWeather(lat, lon), fetchClimate(lat, lon).catch(() => null)]);
      app.weather = w;
      Object.assign(cfg, { lat, lon, place, elev: Math.round(w.elev), kp: c?.kp || '', exclude: '' });
    } catch (e) { // 離線：只用經緯度估算氣候
      app.weather = null;
      Object.assign(cfg, { lat, lon, place, elev: '', kp: '', exclude: '' });
      info(t('連不上 Open-Meteo（{err}），氣候改用緯度估算。', { err: e.message }));
    }
    app.apply();
  }

  $('geoPreset').onchange = e => { const p = PRESETS[e.target.value]; if (p) setPlace(p[1], p[2], t(p[0])); e.target.value = ''; };
  $('geoMe').onclick = e => {
    if (!navigator.geolocation) return flash(e.target, t('瀏覽器不支援'));
    navigator.geolocation.getCurrentPosition(
      p => setPlace(Math.round(p.coords.latitude * 10) / 10, Math.round(p.coords.longitude * 10) / 10, t('我的位置')),
      () => flash(e.target, t('沒有取得位置權限')), { maximumAge: 3600e3, timeout: 15e3 });
  };
  $('geoSearch').onclick = async () => {
    const name = $('geoQ').value.trim(), box = $('geoResults');
    if (!name) return;
    box.textContent = t('搜尋中…');
    try {
      const list = await searchPlace(name);
      box.textContent = list.length ? '' : t('找不到，試試英文名稱（例：Taipei、Kyoto）');
      for (const r of list) {
        const b = document.createElement('button');
        b.textContent = r.name; b.onclick = () => { box.textContent = ''; setPlace(r.lat, r.lon, r.name); };
        box.append(b);
      }
    } catch (e) { box.textContent = t('搜尋失敗：{err}', { err: e.message }); }
  };
  $('geoQ').addEventListener('keydown', e => { if (e.key === 'Enter') $('geoSearch').click(); });
  $('geoQ').addEventListener('input', e => e.stopPropagation());
  $('live').onchange = e => { app.cfg.live = e.target.checked ? 1 : 0; app.apply(); app.sync(); };
  $('geoClear').onclick = () => { Object.assign(app.cfg, { lat: '', lon: '', elev: '', kp: '', place: '', exclude: '', live: 0 }); app.weather = null; gbif.clear(); app.apply(); };

  // GBIF：候選物種逐一查 100 km 內的紀錄，0 筆的排除（例如候選表說「北美有」但這一帶其實沒有）
  $('geoVerify').onclick = async e => {
    const cfg = app.cfg, btn = e.target;
    if (cfg.lat === '') return flash(btn, t('先選地點'));
    const eco = app.stage.scene?.eco || ecosystem(cfg), all = ecosystem({ ...cfg, month: eco.month, exclude: '' }).species;
    btn.disabled = true;
    let done = 0;
    await Promise.all(all.map(async sp => {
      try { gbif.set(sp.sci, await gbifCount(sp.sci, cfg.lat, cfg.lon)); } catch { /* 查不到就不排除 */ }
      btn.textContent = t('查詢中 {n}/{total}', { n: ++done, total: all.length });
    }));
    cfg.exclude = all.filter(sp => gbif.get(sp.sci) === 0).map(sp => sp.id).join(',');
    btn.disabled = false; btn.textContent = t('用 GBIF 確認附近真的有');
    app.apply();
  };

  app.addEventListener('config', () => {
    $('live').checked = !!app.cfg.live;
    $('month').value = app.cfg.month;
    $('habitat').value = app.cfg.habitat;
  });

  // 場景重建後：地點摘要 + 畫面裡實際出現的物種
  app.addEventListener('scene', () => {
    const S = app.stage.scene, cfg = app.cfg;
    if (!S?.eco) { info(''); $('speciesList').innerHTML = ''; return; }
    const e = S.eco, w = app.weather, ns = (v, p, n) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? p : n}`;
    const time = e.located ? localTime(cfg, w).toISOString().slice(11, 16) : '';
    info(e.located
      ? [cfg.place || t('自訂地點'), `${ns(e.lat, 'N', 'S')} ${ns(e.lon, 'E', 'W')}`, cfg.elev !== '' ? t('海拔 {m} m', { m: cfg.elev }) : '', t('當地 {time}', { time }),
        `${e.kp} ${short(CLIMATES[e.group])}${cfg.kp ? '' : t('（估算）')}`, `${t('{m} 月', { m: e.month })} · ${t(SEASONS[e.season])}`, short(REALMS[e.realm]),
        w ? `${t(weatherLabel(w.code))} ${Math.round(w.temp)}°C` : ''].filter(Boolean).join(' · ')
      : t('未選地點：預設為溫帶歐洲的夏天池塘（{kp}）。選個地點，物種與配色就會照當地來。', { kp: e.kp }));
    const seen = new Map(), note = (id, extra) => { if (id && !seen.has(id)) seen.set(id, extra || ''); };
    for (const o of S.objs) note(o.species);
    for (const l of S.lilies) note(l.species);
    for (const f of S.fish) note(f.species);
    for (const d of S.ducks) note(d.species, t('浮在水面划水'));
    for (const f of S.frogs) note(f.species, t('蹲在荷葉上'));
    for (const b of S.birds || []) note(b.species, t(ACT[b.act]));
    const excluded = String(cfg.exclude).split(',').filter(Boolean).length;
    $('speciesList').innerHTML = [...seen].map(([id, act]) => {
      const sp = speciesById(id);
      if (!sp) return '';
      const n = gbif.get(sp.sci), why = [sp.note ? t(sp.note) : t('{realm}原生、適應{climate}氣候', { realm: short(REALMS[e.realm]), climate: short(CLIMATES[e.group]) }), act && t('行為：{act}', { act }),
        n != null && t('GBIF 100 km 內 {n} 筆紀錄', { n: n.toLocaleString() })].filter(Boolean).join(t('；'));
      return `<li><b>${esc(t(sp.zh))}</b> <i>${esc(sp.sci)}</i><span class="why">${esc(why)}</span></li>`;
    }).join('') + (excluded ? `<li class="why">${esc(t('已排除 {n} 種在這附近沒有觀察紀錄的候選物種', { n: excluded }))}</li>` : '');
  });
}
