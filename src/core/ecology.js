// 生態：地點 → 生物地理區、氣候（柯本分類）、季節、太陽高度 → 這個地方、這個季節、這種水域「真的會出現」的物種。
// 純函式、不碰網路：氣候資料由 UI 從 Open-Meteo 取得後傳進來；沒有資料時用緯度與海拔估算。
// 物種表是人工整理的候選名單（原生或已長期歸化），UI 再用 GBIF 的實際觀察紀錄確認附近真的有。

// ---------- 地理與氣候 ----------

// 生物地理區（Udvardy / WWF 八大區的粗略經緯度框）。邊界地帶（例如台灣、墨西哥）兩邊的物種都可能出現，所以物種另外用 where 細分
export const REALMS = {
  PA: '古北界（歐洲、北非、溫帶亞洲）', NA: '新北界（北美）', NT: '新熱帶界（中南美）', AT: '非洲熱帶界',
  IM: '印度馬來界（南亞、東南亞、華南）', AU: '澳大拉西亞界（澳洲、紐西蘭、新幾內亞）', OC: '大洋洲界（太平洋島嶼）', AN: '南極界',
};
export function realmOf(lat, lon) {
  if (lat < -60) return 'AN';
  if ((lon >= 155 || lon < -140) && Math.abs(lat) < 30) return 'OC'; // 太平洋島嶼（夏威夷、斐濟…）
  if (lon >= -170 && lon < -30) return lat > 20 || (lat > 15 && lon < -95) ? 'NA' : 'NT'; // 墨西哥高原以北算北美
  if (lon >= 110 && (lat < -10 || (lon >= 130 && lat < 0))) return 'AU'; // 華萊士線以東
  if (lon >= 165 && lat < -30) return 'AU'; // 紐西蘭
  if (lon >= -30 && lon < 60 && lat < 20) return 'AT'; // 撒哈拉以南（含阿拉伯南端）
  if (lon >= 60 && lon < 150 && lat < 28 && lat > -11) return 'IM'; // 喜馬拉雅以南、華南、東南亞
  return 'PA';
}
// 東亞（日本、韓國、中國東部、台灣）：很多物種只在這一帶（例如花嘴鴨、黑尾鷗、染井吉野櫻）
export const isEastAsia = (lat, lon) => lon >= 100 && lon <= 150 && lat >= 18 && lat <= 55;

export const CLIMATES = {
  A: '熱帶（最冷月 ≥ 18°C）', B: '乾燥（降水少於蒸發）', C: '溫帶（最冷月 0–18°C）', D: '大陸型（最冷月 < 0°C）', E: '寒帶（最暖月 < 10°C）',
};
// 柯本氣候分類：12 個月的平均氣溫（°C）與降水（mm）；lat 用來判斷哪半年是夏天
export function koppen(temp, prec, lat) {
  const T = temp.reduce((a, b) => a + b, 0) / 12, P = prec.reduce((a, b) => a + b, 0);
  const hot = Math.max(...temp), cold = Math.min(...temp);
  const summer = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2], winter = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(m => !summer.includes(m));
  const Ps = summer.reduce((a, m) => a + prec[m], 0);
  if (hot < 10) return hot > 0 ? 'ET' : 'EF';
  const th = 20 * T + (Ps >= 0.7 * P ? 280 : Ps >= 0.3 * P ? 140 : 0);
  if (P < th) return (P < th / 2 ? 'BW' : 'BS') + (T >= 18 ? 'h' : 'k');
  if (cold >= 18) { const dry = Math.min(...prec); return 'A' + (dry >= 60 ? 'f' : dry >= 100 - P / 25 ? 'm' : 'w'); }
  const sDry = Math.min(...summer.map(m => prec[m])), wDry = Math.min(...winter.map(m => prec[m]));
  const sWet = Math.max(...summer.map(m => prec[m])), wWet = Math.max(...winter.map(m => prec[m]));
  const second = sDry < 40 && sDry < wWet / 3 ? 's' : wDry < sWet / 10 ? 'w' : 'f';
  const third = hot >= 22 ? 'a' : temp.filter(v => v >= 10).length >= 4 ? 'b' : 'c';
  return (cold > 0 ? 'C' : 'D') + second + third;
}
// 沒有氣候資料時的估算：緯度越高越冷、海拔每升 1 km 降 6.5°C，季節溫差隨緯度變大；假設濕潤
export function estimateMonthly(lat, elev = 0) {
  const a = Math.abs(lat), mean = 27 - 0.5 * Math.max(0, a - 12) - 6.5 * elev / 1000, amp = Math.min(40, 1 + a * 0.55);
  const temp = Array.from({ length: 12 }, (_, m) => mean - (amp / 2) * Math.cos(((m - (lat >= 0 ? 0.5 : 6.5)) / 12) * 2 * Math.PI));
  return { temp, prec: Array(12).fill(80) };
}

// 季節：熱帶沒有四季（不會有秋葉、雪）；南半球和北半球相反
export const SEASONS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬', tropical: '熱帶（全年）' };
export function seasonOf(month, lat, group) {
  if (group === 'A' || Math.abs(lat) < 15) return 'tropical';
  const m = lat >= 0 ? month : ((month + 5) % 12) + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

// 太陽高度角（度）：NOAA 的近似公式，誤差約 1°，夠判斷白天／黃昏／夜晚
export function sunElevation(date, lat, lon) {
  const d = (date.getTime() / 86400000) + 2440587.5 - 2451545, g = (357.529 + 0.98560028 * d) * Math.PI / 180;
  const q = 280.459 + 0.98564736 * d, L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 0.00000036 * d) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = ((gmst * 15 + lon) * Math.PI / 180) - ra, la = lat * Math.PI / 180;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
}

// ---------- 物種表 ----------
// [id, 中文名, 學名, 類別/外觀, 生物地理區, 氣候大類, 水域, 選項]
//   水域：P 池塘、L 大型湖泊、C 海岸、O 海洋
//   選項：lat [min, max]、where(lat, lon)、not [季節]（例如候鳥冬天不在）、note（為什麼在這裡）、color（外觀用的顏色）
const ALL = 'PA NA NT AT IM AU OC';
const S = (id, zh, sci, kind, realms, climates, habitats, opt = {}) => ({ id, zh, sci, kind, realms: realms.split(' '), climates, habitats, ...opt });
export const SPECIES = [
  // 樹（外觀類型：broadleaf 闊葉、conifer 針葉、palm 棕櫚、cactus 仙人掌、shrub 灌叢；deciduous 冬天落葉）
  S('quercus-robur', '夏櫟', 'Quercus robur', 'tree:broadleaf', 'PA', 'CD', 'PL', { deciduous: 1, where: (la, lo) => lo < 60 }),
  S('pinus-sylvestris', '歐洲赤松', 'Pinus sylvestris', 'tree:conifer', 'PA', 'CD', 'PLC', { where: (la, lo) => lo < 140 && la > 38 }),
  S('salix-babylonica', '垂柳', 'Salix babylonica', 'tree:broadleaf', 'PA IM', 'C', 'PL', { deciduous: 1, note: '原生中國，水邊廣泛栽植', color: '#6f9a46' }),
  S('zelkova-serrata', '櫸木', 'Zelkova serrata', 'tree:broadleaf', 'PA IM', 'CD', 'PL', { deciduous: 1, where: isEastAsia }),
  S('cinnamomum-camphora', '樟樹', 'Cinnamomum camphora', 'tree:broadleaf', 'PA IM', 'AC', 'PL', { where: isEastAsia, color: '#4f7a3a' }),
  S('prunus-yedoensis', '染井吉野櫻', 'Prunus × yedoensis', 'tree:broadleaf', 'PA', 'C', 'PL', { deciduous: 1, where: (la, lo) => isEastAsia(la, lo) && la > 30, note: '日本、韓國公園水邊常見' }),
  S('pinus-thunbergii', '黑松', 'Pinus thunbergii', 'tree:conifer', 'PA', 'C', 'LC', { where: (la, lo) => isEastAsia(la, lo) && la > 30, note: '東亞海岸防風林' }),
  S('acer-rubrum', '紅花槭', 'Acer rubrum', 'tree:broadleaf', 'NA', 'CD', 'PL', { deciduous: 1 }),
  S('pinus-strobus', '北美喬松', 'Pinus strobus', 'tree:conifer', 'NA', 'CD', 'PL', { where: (la, lo) => lo > -100 }),
  S('taxodium-distichum', '落羽杉', 'Taxodium distichum', 'tree:conifer', 'NA', 'C', 'PL', { deciduous: 1, where: (la, lo) => la < 40 && lo > -100, note: '美國東南部沼澤的代表樹' }),
  S('picea-abies', '歐洲雲杉', 'Picea abies', 'tree:conifer', 'PA', 'DE', 'PL', { where: (la, lo) => lo < 60 }),
  S('picea-mariana', '黑雲杉', 'Picea mariana', 'tree:conifer', 'NA', 'DE', 'PL'),
  S('larix-gmelinii', '興安落葉松', 'Larix gmelinii', 'tree:conifer', 'PA', 'DE', 'PL', { deciduous: 1, where: (la, lo) => lo >= 60 }),
  S('betula-pendula', '垂枝樺', 'Betula pendula', 'tree:broadleaf', 'PA', 'DE', 'PL', { deciduous: 1, color: '#7aa04a' }),
  S('eucalyptus-camaldulensis', '赤桉', 'Eucalyptus camaldulensis', 'tree:broadleaf', 'AU', 'ABC', 'PL', { color: '#7f9a74', note: '澳洲河岸最常見的桉樹' }),
  S('melaleuca', '白千層', 'Melaleuca quinquenervia', 'tree:broadleaf', 'AU', 'AC', 'PL'),
  S('ficus-benghalensis', '孟加拉榕', 'Ficus benghalensis', 'tree:broadleaf', 'IM', 'A', 'PL', { color: '#2f6a32' }),
  S('ficus-microcarpa', '榕樹', 'Ficus microcarpa', 'tree:broadleaf', 'IM AU', 'AC', 'PL', { color: '#2f6a32' }),
  S('ceiba-pentandra', '吉貝木棉', 'Ceiba pentandra', 'tree:broadleaf', 'NT AT', 'A', 'PL', { color: '#2f7a34' }),
  S('vachellia-tortilis', '傘刺金合歡', 'Vachellia tortilis', 'tree:broadleaf', 'AT', 'AB', 'PL', { color: '#6a8a3a', note: '非洲莽原的傘形樹' }),
  S('cocos-nucifera', '椰子', 'Cocos nucifera', 'tree:palm', 'IM AU OC NT AT', 'A', 'C', { lat: [-26, 26], note: '熱帶海岸' }),
  S('phoenix-dactylifera', '海棗', 'Phoenix dactylifera', 'tree:palm', 'PA AT IM', 'B', 'PL', { lat: [15, 35], where: (la, lo) => lo > -20 && lo < 75, note: '綠洲' }),
  S('washingtonia-filifera', '加州蒲葵', 'Washingtonia filifera', 'tree:palm', 'NA', 'BC', 'PL', { lat: [25, 37], where: (la, lo) => lo < -100 }),
  S('roystonea-regia', '大王椰子', 'Roystonea regia', 'tree:palm', 'NT NA', 'A', 'PL', { lat: [5, 28] }),
  S('podocarpus-falcatus', '鐮葉羅漢松', 'Podocarpus falcatus', 'tree:conifer', 'AT', 'C', 'PLC', { lat: [-35, -15] }),
  S('euterpe-oleracea', '阿薩伊椰', 'Euterpe oleracea', 'tree:palm', 'NT', 'A', 'PL', { note: '亞馬遜河口的氾濫林' }),
  S('mauritia-flexuosa', '湖棕', 'Mauritia flexuosa', 'tree:palm', 'NT', 'A', 'PL'),
  S('pandanus-tectorius', '林投', 'Pandanus tectorius', 'tree:palm', 'OC IM AU', 'AC', 'C', { lat: [-30, 30], note: '熱帶、亞熱帶太平洋海岸' }),
  S('metrosideros-polymorpha', '多形鐵心木', 'Metrosideros polymorpha', 'tree:broadleaf', 'OC', 'AC', 'PL', { lat: [18, 23], note: '夏威夷原生' }),
  // 海岸林：海邊只長耐鹽、耐風的樹
  S('hibiscus-tiliaceus', '黃槿', 'Hibiscus tiliaceus', 'tree:broadleaf', 'IM AU OC PA', 'AC', 'C', { lat: [-30, 32], where: (la, lo) => lo > 60 || lo < -140, color: '#3f7a3a' }),
  S('casuarina-equisetifolia', '木麻黃', 'Casuarina equisetifolia', 'tree:conifer', 'AU IM OC', 'AC', 'C', { lat: [-30, 30], note: '熱帶海岸防風林（針狀小枝）', color: '#4a6a4a' }),
  S('pinus-pinaster', '海岸松', 'Pinus pinaster', 'tree:conifer', 'PA', 'C', 'C', { where: (la, lo) => lo < 20 && la > 30 }),
  S('pinus-contorta', '扭葉松（海岸型）', 'Pinus contorta var. contorta', 'tree:conifer', 'NA', 'CD', 'C', { where: (la, lo) => lo < -115 }),
  S('metrosideros-excelsa', '紐西蘭聖誕樹', 'Metrosideros excelsa', 'tree:broadleaf', 'AU', 'C', 'C', { lat: [-40, -34], where: (la, lo) => lo > 165 }),
  S('opuntia', '仙人掌（團扇屬）', 'Opuntia spp.', 'tree:cactus', 'NA NT', 'B', 'PLC', { note: '仙人掌只原生於美洲' }),
  S('salix-arctica', '北極柳', 'Salix arctica', 'tree:shrub', 'PA NA', 'E', 'PLC', { note: '苔原只有貼地的矮灌木' }),

  // 水生植物
  S('nymphaea-alba', '白睡蓮', 'Nymphaea alba', 'aquatic:lily', 'PA', 'CD', 'PL', { not: ['winter'], color: '#ffffff' }),
  S('nymphaea-odorata', '香睡蓮', 'Nymphaea odorata', 'aquatic:lily', 'NA', 'CD', 'PL', { not: ['winter'], color: '#ffffff' }),
  S('nymphaea-nouchali', '藍睡蓮', 'Nymphaea nouchali', 'aquatic:lily', 'AT IM AU', 'AC', 'PL', { color: '#9aa8f0' }),
  S('nelumbo-nucifera', '蓮', 'Nelumbo nucifera', 'aquatic:lily', 'IM PA AU', 'AC', 'PL', { not: ['winter'], where: (la, lo) => lo > 70, color: '#f6aac8' }),
  S('nymphaea-ampla', '白花睡蓮（美洲）', 'Nymphaea ampla', 'aquatic:lily', 'NT', 'A', 'PL', { color: '#ffffff' }),
  S('victoria-amazonica', '亞馬遜王蓮', 'Victoria amazonica', 'aquatic:lily', 'NT', 'A', 'L', { color: '#ffffff', note: '亞馬遜河流域' }),
  S('typha', '香蒲', 'Typha spp.', 'aquatic:reeds', ALL, 'ABCD', 'PL', { note: '全世界淡水濕地都有' }),

  // 魚（從水面上看是暗影；錦鯉例外）
  S('cyprinus-carpio', '鯉魚', 'Cyprinus carpio', 'fish', 'PA IM', 'ABCD', 'PL'),
  S('carassius-auratus', '鯽魚', 'Carassius auratus', 'fish', 'PA IM', 'ACD', 'P', { where: (la, lo) => lo > 60 }),
  S('koi', '錦鯉', 'Cyprinus rubrofuscus (觀賞品系)', 'fish:koi', 'PA IM', 'AC', 'P', { where: isEastAsia, note: '東亞公園、庭園池塘的觀賞魚；野外池塘不會有' }),
  S('perca-fluviatilis', '河鱸', 'Perca fluviatilis', 'fish', 'PA', 'CD', 'PL', { where: (la, lo) => lo < 100 }),
  S('lepomis-macrochirus', '藍鰓太陽魚', 'Lepomis macrochirus', 'fish', 'NA', 'CD', 'PL'),
  S('micropterus-salmoides', '大口黑鱸', 'Micropterus salmoides', 'fish', 'NA', 'ACD', 'PL'),
  S('oreochromis-niloticus', '尼羅吳郭魚', 'Oreochromis niloticus', 'fish', 'AT', 'AB', 'PL'),
  S('piaractus', '巴西鯧（大蓋巨脂鯉）', 'Piaractus mesopotamicus', 'fish', 'NT', 'A', 'PL'),
  S('maccullochella-peelii', '蟲紋麥鱈鱸', 'Maccullochella peelii', 'fish', 'AU', 'BC', 'L'),
  S('salvelinus-alpinus', '北極紅點鮭', 'Salvelinus alpinus', 'fish', 'PA NA', 'DE', 'L'),
  S('channa-striata', '線鱧', 'Channa striata', 'fish', 'IM', 'AC', 'PL'),
  S('oreochromis-mossambicus', '莫三比克吳郭魚', 'Oreochromis mossambicus', 'fish', 'AT', 'ABC', 'PL', { lat: [-35, 0] }),
  S('macquaria-ambigua', '金鱸', 'Macquaria ambigua', 'fish', 'AU', 'ABC', 'PL'),
  S('mugil-cephalus', '烏魚（鯔）', 'Mugil cephalus', 'fish', ALL, 'ABC', 'C', { note: '熱帶到溫帶的沿岸淺水' }),

  // 兩棲
  S('pelophylax-ridibundus', '湖蛙', 'Pelophylax ridibundus', 'frog', 'PA', 'CD', 'P', { not: ['winter'], where: (la, lo) => lo < 90 }),
  S('pelophylax-nigromaculatus', '黑斑側褶蛙', 'Pelophylax nigromaculatus', 'frog', 'PA IM', 'CD', 'P', { not: ['winter'], where: isEastAsia }),
  S('hylarana-guentheri', '沼蛙', 'Hylarana guentheri', 'frog', 'IM', 'AC', 'P', { where: (la, lo) => lo > 100 }),
  S('lithobates-catesbeianus', '美國牛蛙', 'Lithobates catesbeianus', 'frog', 'NA', 'CD', 'PL', { not: ['winter'] }),
  S('hoplobatrachus-tigerinus', '虎紋蛙', 'Hoplobatrachus tigerinus', 'frog', 'IM', 'A', 'P'),
  S('leptodactylus-pentadactylus', '南美牛蛙', 'Leptodactylus pentadactylus', 'frog', 'NT', 'A', 'P'),
  S('hoplobatrachus-occipitalis', '非洲虎紋蛙', 'Hoplobatrachus occipitalis', 'frog', 'AT', 'AB', 'P'),
  S('amietia-angolensis', '安哥拉河蛙', 'Amietia angolensis', 'frog', 'AT', 'ABC', 'P'),
  S('litoria-raniformis', '咆哮草蛙', 'Litoria raniformis', 'frog', 'AU', 'C', 'P', { not: ['winter'] }),

  // 鴨（在水面游）：color 指定外觀配色
  S('anas-platyrhynchos', '綠頭鴨', 'Anas platyrhynchos', 'bird:duck', 'PA NA', 'BCD', 'PL', { color: 'mallard' }),
  S('anas-zonorhyncha', '花嘴鴨', 'Anas zonorhyncha', 'bird:duck', 'PA IM', 'ACD', 'PL', { where: isEastAsia, color: 'spotbill' }),
  S('anas-superciliosa', '太平洋黑鴨', 'Anas superciliosa', 'bird:duck', 'AU OC', 'ABC', 'PL', { lat: [-50, 0], color: 'spotbill' }),
  S('cairina-moschata', '疣鼻栖鴨', 'Cairina moschata', 'bird:duck', 'NT', 'A', 'PL', { color: 'muscovy' }),
  S('dendrocygna-viduata', '白臉樹鴨', 'Dendrocygna viduata', 'bird:duck', 'AT NT', 'A', 'PL', { color: 'whistling' }),
  S('anas-undulata', '黃嘴鴨', 'Anas undulata', 'bird:duck', 'AT', 'ABC', 'PL', { lat: [-35, 15], color: 'spotbill' }),
  S('dendrocygna-javanica', '樹鴨', 'Dendrocygna javanica', 'bird:duck', 'IM', 'AC', 'PL', { color: 'whistling' }),
  S('anas-wyvilliana', '夏威夷鴨', 'Anas wyvilliana', 'bird:duck', 'OC', 'AC', 'PL', { lat: [18, 23], color: 'spotbill' }),
  S('somateria-mollissima', '歐絨鴨', 'Somateria mollissima', 'bird:duck', 'PA NA', 'DE', 'CO', { lat: [45, 80], color: 'eider' }),

  // 其他鳥：外觀類型決定會做的動作（跳、涉水、俯衝、掠水飛、盤旋、游泳潛水、海灘奔跑、搖擺走路）
  S('passer-montanus', '麻雀', 'Passer montanus', 'bird:sparrow', 'PA IM', 'ACD', 'PLC', { color: ['#8a5a3a', '#b89a78', '#5a4030'] }),
  S('passer-domesticus', '家麻雀', 'Passer domesticus', 'bird:sparrow', 'PA NA NT AT AU', 'BCD', 'PLC', { where: (la, lo) => !isEastAsia(la, lo), note: '原生歐亞，已歸化到各大洲城鎮', color: ['#7a6048', '#a89a88', '#4a4038'] }),
  S('turdus-migratorius', '旅鶇', 'Turdus migratorius', 'bird:sparrow', 'NA', 'CD', 'PL', { color: ['#4a4440', '#c8642e', '#2a2624'] }),
  S('acridotheres-tristis', '家八哥', 'Acridotheres tristis', 'bird:sparrow', 'IM AU', 'AC', 'PLC', { color: ['#6a4a32', '#7a5a40', '#1e1c1a'] }),
  S('motacilla-alba', '白鶺鴒', 'Motacilla alba', 'bird:sparrow', 'PA IM', 'ACD', 'PLC', { not: ['winter'], color: ['#5a5a5a', '#f0f0ee', '#1a1a1a'] }),
  S('furnarius-rufus', '棕灶鳥', 'Furnarius rufus', 'bird:sparrow', 'NT', 'AC', 'PL', { lat: [-40, -5], color: ['#a8683a', '#d0a070', '#7a4a2a'] }),
  S('rhipidura-leucophrys', '黑白扇尾鶲', 'Rhipidura leucophrys', 'bird:sparrow', 'AU', 'ABC', 'PL', { color: ['#1e1e1e', '#f0f0ee', '#1e1e1e'] }),
  S('corvus-macrorhynchos', '巨嘴鴉', 'Corvus macrorhynchos', 'bird:crow', 'PA IM', 'ACD', 'PLC', { where: (la, lo) => lo > 70, color: ['#1c1c22', '#1c1c22', '#30303a'] }),
  S('pica-pica', '喜鵲', 'Pica pica', 'bird:crow', 'PA', 'CD', 'PL', { color: ['#1a1e2a', '#f0f0ee', '#2a3a6a'] }),
  S('corvus-brachyrhynchos', '短嘴鴉', 'Corvus brachyrhynchos', 'bird:crow', 'NA', 'CD', 'PLC', { color: ['#1c1c22', '#1c1c22', '#30303a'] }),
  S('corvus-albus', '斑駁鴉', 'Corvus albus', 'bird:crow', 'AT', 'ABC', 'PLC', { color: ['#1c1c22', '#f0f0ee', '#1c1c22'] }),
  S('gymnorhina-tibicen', '黑背鐘鵲', 'Gymnorhina tibicen', 'bird:crow', 'AU', 'BC', 'PL', { color: ['#1c1c22', '#f0f0ee', '#1c1c22'] }),
  S('ardea-cinerea', '蒼鷺', 'Ardea cinerea', 'bird:heron', 'PA AT IM', 'ABCD', 'PLC', { color: ['#9aa0a8', '#e8e8e4', '#2a2a30'] }),
  S('ardea-herodias', '大藍鷺', 'Ardea herodias', 'bird:heron', 'NA NT', 'ABCD', 'PLC', { lat: [5, 60], color: ['#7a8aa0', '#c8c8c4', '#2a2a30'] }),
  S('egretta-garzetta', '小白鷺', 'Egretta garzetta', 'bird:heron', 'PA AT IM AU', 'ABC', 'PLC', { color: ['#f4f4f0', '#f4f4f0', '#1a1a1a'] }),
  S('ardea-alba', '大白鷺', 'Ardea alba', 'bird:heron', ALL, 'ABCD', 'PLC', { color: ['#f4f4f0', '#f4f4f0', '#d0a020'], note: '幾乎全世界的溫暖濕地都有' }),
  S('ardea-cocoi', '黑冠白頸鷺', 'Ardea cocoi', 'bird:heron', 'NT', 'AC', 'PL', { color: ['#9aa0a8', '#f0f0ee', '#1a1a1a'] }),
  S('egretta-novaehollandiae', '白臉鷺', 'Egretta novaehollandiae', 'bird:heron', 'AU OC', 'BC', 'PLC', { color: ['#8a9aa8', '#d8dcdc', '#e8e8e8'] }),
  S('egretta-sacra', '岩鷺', 'Egretta sacra', 'bird:heron', 'IM AU OC PA', 'AC', 'C', { where: (la, lo) => lo > 90 || lo < -140, color: ['#4a4e58', '#5a5e68', '#c8b060'] }),
  S('alcedo-atthis', '普通翠鳥', 'Alcedo atthis', 'bird:kingfisher', 'PA IM AT', 'ACD', 'PL', { color: ['#1e7ab8', '#e0782e', '#2aa0d0'] }),
  S('megaceryle-alcyon', '帶魚狗', 'Megaceryle alcyon', 'bird:kingfisher', 'NA NT', 'ACD', 'PL', { color: ['#5a7a9a', '#f0f0ee', '#5a7a9a'] }),
  S('todiramphus-sanctus', '白眉翡翠', 'Todiramphus sanctus', 'bird:kingfisher', 'AU OC', 'ABC', 'PLC', { color: ['#3a8a8a', '#e8d8b8', '#3a7aa0'] }),
  S('corythornis-cristatus', '冠翠鳥', 'Corythornis cristatus', 'bird:kingfisher', 'AT', 'AB', 'PL', { color: ['#2a6ab0', '#e0782e', '#3a9ad0'] }),
  S('hirundo-rustica', '家燕', 'Hirundo rustica', 'bird:swallow', 'PA NA IM AT NT', 'ABCD', 'PLC', { not: ['winter'], note: '夏候鳥：冬天飛到熱帶', color: ['#1e2a5a', '#e8d8c8', '#a83a2a'] }),
  S('hirundo-neoxena', '洋燕', 'Hirundo neoxena', 'bird:swallow', 'AU', 'BC', 'PLC', { color: ['#1e2a5a', '#e8d8c8', '#a83a2a'] }),
  S('milvus-migrans', '黑鳶', 'Milvus migrans', 'bird:raptor', 'PA AT IM AU', 'ABCD', 'PLC', { color: ['#5a4434', '#7a6048', '#3a2a20'] }),
  S('pandion-haliaetus', '魚鷹', 'Pandion haliaetus', 'bird:raptor', ALL, 'ABCD', 'LCO', { color: ['#4a3a30', '#f0f0ee', '#4a3a30'], note: '全世界的大型水域都有' }),
  S('buteo-jamaicensis', '紅尾鵟', 'Buteo jamaicensis', 'bird:raptor', 'NA NT', 'ABCD', 'PL', { lat: [8, 65], color: ['#6a4a34', '#e0d0b8', '#a8502a'] }),
  S('haliaeetus-leucogaster', '白腹海鵰', 'Haliaeetus leucogaster', 'bird:raptor', 'IM AU', 'AC', 'LCO', { color: ['#5a5a60', '#f0f0ee', '#3a3a40'] }),
  S('haliaeetus-leucocephalus', '白頭海鵰', 'Haliaeetus leucocephalus', 'bird:raptor', 'NA', 'CDE', 'LC', { color: ['#3a2a20', '#3a2a20', '#f0f0ee'] }),
  S('larus-crassirostris', '黑尾鷗', 'Larus crassirostris', 'bird:gull', 'PA IM', 'CD', 'CO', { where: isEastAsia, color: ['#5a6068', '#f4f4f0', '#1a1a1a'] }),
  S('larus-argentatus', '銀鷗', 'Larus argentatus', 'bird:gull', 'PA NA', 'CDE', 'LCO', { lat: [30, 75], color: ['#a8b0b8', '#f4f4f0', '#1a1a1a'] }),
  S('chroicocephalus-novaehollandiae', '澳洲紅嘴鷗', 'Chroicocephalus novaehollandiae', 'bird:gull', 'AU OC', 'BC', 'LCO', { color: ['#b8c0c8', '#f4f4f0', '#1a1a1a'] }),
  S('larus-dominicanus', '黑背鷗', 'Larus dominicanus', 'bird:gull', 'NT AT AU AN', 'BCDE', 'CO', { lat: [-70, -15], color: ['#2a2a30', '#f4f4f0', '#1a1a1a'] }),
  S('leucophaeus-atricilla', '笑鷗', 'Leucophaeus atricilla', 'bird:gull', 'NA NT', 'AC', 'CO', { lat: [-5, 45], color: ['#5a6068', '#f4f4f0', '#1a1a1a'] }),
  S('phalacrocorax-carbo', '鸕鷀', 'Phalacrocorax carbo', 'bird:cormorant', 'PA AT IM AU', 'ABCD', 'PLCO', { color: ['#1c2022', '#2a2e30', '#e8e0c0'] }),
  S('nannopterum-auritum', '角鸕鷀', 'Nannopterum auritum', 'bird:cormorant', 'NA', 'BCD', 'LC', { color: ['#1c2022', '#2a2e30', '#e0902a'] }),
  S('nannopterum-brasilianum', '美洲鸕鷀', 'Nannopterum brasilianum', 'bird:cormorant', 'NT NA', 'ABC', 'PLC', { lat: [-55, 33], color: ['#1c2022', '#2a2e30', '#c8a060'] }),
  S('pelecanus-occidentalis', '褐鵜鶘', 'Pelecanus occidentalis', 'bird:pelican', 'NA NT', 'ABC', 'CO', { lat: [-15, 40], color: ['#7a6a5a', '#e8e0d0', '#b08a5a'] }),
  S('pelecanus-conspicillatus', '澳洲鵜鶘', 'Pelecanus conspicillatus', 'bird:pelican', 'AU', 'ABC', 'LC', { color: ['#f0f0ee', '#1a1a1a', '#f0b8c0'] }),
  S('pelecanus-onocrotalus', '白鵜鶘', 'Pelecanus onocrotalus', 'bird:pelican', 'AT PA', 'AB', 'L', { lat: [-30, 46], where: (la, lo) => lo > -20 && lo < 80, color: ['#f4ece8', '#1a1a1a', '#f0c050'] }),
  S('calidris-alba', '三趾濱鷸', 'Calidris alba', 'bird:shorebird', ALL, 'ABCD', 'C', { note: '幾乎全世界沙灘的冬候鳥', color: ['#a8a8a0', '#f4f4f0', '#1a1a1a'] }),
  S('charadrius-alexandrinus', '東方環頸鴴', 'Charadrius alexandrinus', 'bird:shorebird', 'PA IM AT', 'ABC', 'C', { color: ['#b09a7a', '#f4f4f0', '#1a1a1a'] }),
  S('charadrius-nivosus', '雪鴴', 'Charadrius nivosus', 'bird:shorebird', 'NA NT', 'ABC', 'C', { color: ['#d0c0a0', '#f4f4f0', '#1a1a1a'] }),
  S('pluvialis-fulva', '太平洋金斑鴴', 'Pluvialis fulva', 'bird:shorebird', 'OC IM AU', 'AC', 'PC', { not: ['summer'], color: ['#a08a4a', '#c8b880', '#1a1a1a'] }),
  S('charadrius-ruficapillus', '紅頂鴴', 'Charadrius ruficapillus', 'bird:shorebird', 'AU', 'BC', 'C', { color: ['#b8a888', '#f4f4f0', '#b8502a'] }),
  S('spheniscus-demersus', '非洲企鵝', 'Spheniscus demersus', 'bird:penguin', 'AT', 'BC', 'C', { lat: [-36, -25], note: '企鵝只住在南半球，這種在南非、納米比亞海岸', color: ['#1a1a1e', '#f4f4f0', '#d07070'] }),
  S('spheniscus-magellanicus', '麥哲倫企鵝', 'Spheniscus magellanicus', 'bird:penguin', 'NT', 'BCD', 'C', { lat: [-56, -36], color: ['#1a1a1e', '#f4f4f0', '#d07070'] }),
  S('eudyptula-minor', '小藍企鵝', 'Eudyptula minor', 'bird:penguin', 'AU', 'C', 'C', { lat: [-47, -30], color: ['#3a5a7a', '#f4f4f0', '#2a2a2a'] }),
  S('pygoscelis-papua', '巴布亞企鵝', 'Pygoscelis papua', 'bird:penguin', 'AN NT', 'E', 'C', { lat: [-70, -50], color: ['#1a1a1e', '#f4f4f0', '#e0602a'] }),
];
const BY_ID = new Map(SPECIES.map(s => [s.id, s]));
export const speciesById = id => BY_ID.get(id);

const HABITAT_CODE = { pond: 'P', lake: 'L', coast: 'C', ocean: 'O' };
export const HABITATS = { pond: '池塘', lake: '大型湖泊', coast: '海岸', ocean: '海洋' };

// 某地某季某水域可能出現的物種，每種附上理由
export function candidates({ lat, lon, realm, group, season, habitat }) {
  const h = HABITAT_CODE[habitat] || 'P', out = [];
  for (const s of SPECIES) {
    if (!s.realms.includes(realm) || !s.climates.includes(group) || !s.habitats.includes(h)) continue;
    if (s.lat && (lat < s.lat[0] || lat > s.lat[1])) continue;
    if (s.where && !s.where(lat, lon)) continue;
    if (s.not?.includes(season)) continue;
    out.push(s);
  }
  return out;
}

// 預設（沒選地點）：溫帶歐亞的夏天池塘，和原本的森林配色一致
export const DEFAULT_PLACE = { lat: 48, lon: 11, kp: 'Cfb', elev: 500 };

// 綜合：地點 + 氣候 + 季節 + 水域 → 這個場景的生態設定（給 buildScene 用）
// cfg 用到：lat, lon, kp, elev, month, habitat, exclude（GBIF 查無紀錄而排除的物種 id，逗號分隔）
export function ecosystem(cfg) {
  const has = cfg.lat !== '' && cfg.lat != null && Number.isFinite(+cfg.lat);
  const lat = has ? +cfg.lat : DEFAULT_PLACE.lat, lon = has ? +cfg.lon : DEFAULT_PLACE.lon, elev = has ? +cfg.elev || 0 : DEFAULT_PLACE.elev;
  let kp = has ? cfg.kp : DEFAULT_PLACE.kp;
  if (!/^[A-E][A-Za-z]{1,2}$/.test(kp || '')) { const m = estimateMonthly(lat, elev); kp = koppen(m.temp, m.prec, lat); }
  const group = kp[0], realm = realmOf(lat, lon), month = +cfg.month || 6;
  const season = seasonOf(month, lat, group), habitat = HABITATS[cfg.habitat] ? cfg.habitat : 'pond';
  const excluded = new Set(String(cfg.exclude || '').split(',').filter(Boolean));
  const list = candidates({ lat, lon, realm, group, season, habitat }).filter(s => !excluded.has(s.id));
  const of = prefix => list.filter(s => s.kind === prefix || s.kind.startsWith(prefix + ':'));
  const trees = of('tree'), winterBare = season === 'winter' && (group === 'C' || group === 'D');
  return {
    lat, lon, elev, kp, group, realm, month, season, habitat, located: has,
    species: list,
    trees, lilies: of('aquatic:lily'), reeds: of('aquatic:reeds'), fish: of('fish'), frogs: of('frog'), ducks: of('bird:duck'),
    birds: list.filter(s => s.kind.startsWith('bird:') && s.kind !== 'bird:duck'),
    snow: season === 'winter' && (group === 'D' || group === 'E') || group === 'E' && elev > 0 && Math.abs(lat) > 70,
    bare: winterBare, // 冬天的落葉樹沒有葉子
    autumn: season === 'autumn' && (group === 'C' || group === 'D'),
    blossom: season === 'spring' && list.some(s => s.id === 'prunus-yedoensis') && month <= 4,
    flowers: season !== 'winter' && group !== 'E' && !(group === 'B' && season === 'summer'),
    saltwater: habitat === 'coast' || habitat === 'ocean',
  };
}

// ---------- 配色：氣候 × 季節 × 水域，再依太陽高度染上清晨／黃昏／夜晚 ----------
const BASE = {
  temperate: { sky: '#c4ece2', shallow: '#5d9fa6', deep: '#24505a', grass: '#86a03e', dirt: '#6e4f36', foliage: '#3f6b40', trunk: '#5a4030', leaf: '#c9a645' },
  tropical: { sky: '#c8ecff', shallow: '#3fb8b4', deep: '#145a6a', grass: '#5fa83a', dirt: '#7a5a3a', foliage: '#2a7030', trunk: '#5a3e2a', leaf: '#8cc04a' },
  arid: { sky: '#d8ecf2', shallow: '#6ab4ae', deep: '#2a6670', grass: '#b4a866', dirt: '#b08a56', foliage: '#6a7e3c', trunk: '#6a5038', leaf: '#b0a860' },
  boreal: { sky: '#cfe4ea', shallow: '#5a8e98', deep: '#1e4250', grass: '#7a9440', dirt: '#5e4a36', foliage: '#2e5a3c', trunk: '#4a3a2e', leaf: '#c0a040' },
  tundra: { sky: '#dce8ee', shallow: '#7a9eaa', deep: '#2a4a5a', grass: '#9a9a6a', dirt: '#6a5a4a', foliage: '#4a6a4a', trunk: '#4a3a30', leaf: '#b09060' },
};
const SEA = { tropical: ['#4cd0d0', '#0e5a86'], temperate: ['#5aa0b0', '#1a4a6a'], cold: ['#6a8e9e', '#1e3a52'] };
const tint = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const blend = (P, Q, k) => Object.fromEntries(Object.keys(P).map(key => [key, Q[key] ? tint(P[key], Q[key], k) : P[key]]));

export function ecoPalette(eco, sunElev = 45) {
  const { group, season, saltwater } = eco;
  let P = { ...(group === 'A' ? BASE.tropical : group === 'B' ? BASE.arid : group === 'E' ? BASE.tundra : group === 'D' ? BASE.boreal : BASE.temperate) };
  // 秋葉、櫻花只染在落葉樹、櫻樹本身（場景物件處理），這裡只換地面與飄落的葉子
  if (eco.autumn) P = { ...P, leaf: '#e8a03a', grass: '#9a9a4a' };
  if (eco.blossom) P = { ...P, leaf: '#f7c6d8' };
  if (season === 'spring' && !eco.blossom) P = { ...P, grass: tint(P.grass, '#8cc048', 0.4), foliage: tint(P.foliage, '#5a9a40', 0.35) };
  if (season === 'winter' && group === 'C') P = { ...P, grass: tint(P.grass, '#8a8a5a', 0.5) };
  if (eco.snow) P = { ...P, grass: '#e6eef2', dirt: '#8a8076', sky: '#d8e6ee', shallow: '#7a9cac', deep: '#2e4a5e', leaf: '#c8ccc8' };
  if (eco.habitat === 'coast') P = { ...P, dirt: tint(P.dirt, '#e0cc98', 0.65) }; // 沙灘
  if (saltwater) { const [sh, dp] = group === 'A' ? SEA.tropical : group === 'D' || group === 'E' ? SEA.cold : SEA.temperate; P = { ...P, shallow: sh, deep: dp }; }
  // 太陽高度：> 10° 白天；-4…10° 清晨或黃昏的暖色；< -4° 夜晚
  const dusk = { sky: '#ffc48a', shallow: '#c98f78', deep: '#2f3466', grass: '#7a8b3c', foliage: '#3e5a2a', dirt: '#7a5038', trunk: '#4a2e22' };
  const night = { sky: '#4a5a90', shallow: '#2c5c78', deep: '#0a1630', grass: '#26492f', dirt: '#3e3328', foliage: '#163322', trunk: '#2a1d16', leaf: '#4f7a4a' };
  if (sunElev < 10 && sunElev >= -4) P = blend(P, dusk, 0.6 * (1 - Math.max(0, sunElev) / 10));
  if (sunElev < -4) P = blend(P, night, Math.min(0.85, 0.55 + (-4 - sunElev) * 0.05));
  return P;
}
