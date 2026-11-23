// 介面語言：中文為原文、英文是對照表。字串本身就是 key：t('中文') 在英文模式回傳翻譯，查不到就回傳原文。
// 語言來源：網址 ?lang=en|zh → 上次的選擇（localStorage）→ 瀏覽器語言。
// 切換不重新載入：靜態文字由 translateDom 依「原文 key」重翻，動態文字由各面板聽 langchange 事件重畫。
// ponytail: 一張 zh→en 對照表；要加第三種語言時再改成 { key: { en, ja } }。

const pick = () => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'zh') return q;
  try { const s = localStorage.getItem('lang'); if (s === 'en' || s === 'zh') return s; } catch { /* 無痕模式 */ }
  return /^zh/i.test(navigator.language) ? 'zh' : 'en';
};
export let lang = pick();

export function setLang(l) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem('lang', l); } catch { /* 無痕模式 */ }
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(null, '', u.href); }
  translateDom();
  dispatchEvent(new Event('langchange'));
}

// t('查詢中 {n}/{total}', { n, total })
export function t(zh, vars) {
  let s = lang === 'en' ? EN[zh] ?? zh : zh;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// 任一語言的字串 → 中文原文 key（找不到 = 不是可翻譯的字串）
const keyOf = s => (s in EN ? s : ZH[s]);

// 靜態文字：每個文字節點、placeholder / title / aria-label 記住自己的原文 key，切換時從 key 重翻（保留前後空白）
const ATTRS = ['placeholder', 'title', 'aria-label'];
export function translateDom() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  document.title = t(keyOf(document.title) ?? document.title);
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const cur = n.nodeValue.trim();
    if (!cur) continue;
    const key = n.i18nKey ?? (n.i18nKey = keyOf(cur));
    if (key) n.nodeValue = n.nodeValue.replace(cur, t(key));
  }
  for (const a of ATTRS) for (const el of document.body.querySelectorAll(`[${a}]`)) {
    const prop = 'i18n_' + a, key = el[prop] ?? (el[prop] = keyOf(el.getAttribute(a)));
    if (key) el.setAttribute(a, t(key));
  }
}

const EN = {
  // ---------- index.html ----------
  'Pixel Pond 動態桌布': 'Pixel Pond — Live Wallpaper',
  '正在顯示照片：': 'Showing photo: ',
  '✕ 取消照片': '✕ Remove photo',
  '像素池塘 · 動態桌布': 'Pixel Pond · Live Wallpaper',
  '用一句話、滑桿，或一張風景照，做出會動的像素桌布。': 'Make an animated pixel-art wallpaper from a sentence, a few sliders, or a landscape photo.',
  '套用描述': 'Apply description',
  '🎲 換一個場景': '🎲 New scene',
  '場景': 'Scene',
  '配色': 'Palette',
  '地標': 'Landmarks',
  '場景編號（seed）': 'Scene number (seed)',
  '地區與生態（現實同步）': 'Region & ecology (real-world sync)',
  '水域': 'Water body',
  '池塘': 'Pond',
  '大型湖泊': 'Large lake',
  '海岸': 'Coast',
  '海洋': 'Ocean',
  '📍 用我的位置': '📍 Use my location',
  '常用地區…': 'Popular places…',
  '搜尋': 'Search',
  '月份（季節）': 'Month (season)',
  '跟著當地現在': 'Local month right now',
  '即時同步天氣（每 10 分鐘；下雨有漣漪、風大樹會搖）': 'Live weather sync (every 10 min; rain makes ripples, wind sways trees)',
  '用 GBIF 確認附近真的有': 'Verify with GBIF records nearby',
  '取消地點': 'Clear place',
  '選了地點後，物種、季節、配色（含清晨／黃昏／夜晚）都依當地決定。資料來自 Open-Meteo 與 GBIF，只在按按鈕或開即時同步時連線；位置只取到小數一位（約 10 公里）。':
    'Once a place is set, species, season and colors (including dawn, dusk and night) follow that place. Data comes from Open-Meteo and GBIF, fetched only when you press a button or turn on live sync; your location is rounded to one decimal (about 10 km).',
  '水面與動態': 'Water & motion',
  '六步打磨（關掉看差別）': 'Six polish steps (toggle to compare)',
  '對照：原始貼圖 ↔ 六步完成': 'Compare: raw tiles ↔ all six steps',
  '風景照轉換': 'Landscape photo',
  '把風景照轉成本產品的像素風格：減色、暗部偏藍綠亮部偏暖、往目前配色靠攏，並自動找出水面套上晃動、亮點與漣漪。':
    'Turn a landscape photo into this pixel style: fewer colors, teal shadows and warm highlights pulled toward the current palette. Water is detected automatically and gets wobble, glints and ripples.',
  '風景照': 'Photo',
  '顏色數': 'Colors',
  '配色風格強度': 'Palette strength',
  '水面偵測靈敏度': 'Water detection sensitivity',
  '水線位置': 'Waterline position',
  '自動': 'Auto',
  '抖動': 'Dither',
  '雲飄動（找得到藍天上的雲才會動）': 'Drifting clouds (only when clouds are found on blue sky)',
  '植物隨風擺動（跟著「風」滑桿）': 'Plants sway in the wind (uses the Wind slider)',
  '移除照片，回到程式場景': 'Remove photo, back to the generated scene',
  '照片只存在這個分頁。桌布網址（Plash）不會帶著照片；請用「錄影片」輸出無縫循環的影片。': 'The photo lives only in this tab. The wallpaper URL (Plash) cannot carry it; use “Record video” to export a seamless loop instead.',
  '素材圖與像素化': 'Art assets & pixelate',
  '使用素材圖取代程式畫的元素': 'Use art assets instead of generated elements',
  '素材 PNG（可多選、透明背景；依檔名分類，例如 flora-back-oak.png）': 'Asset PNGs (multiple, transparent background; sorted by file name, e.g. flora-back-oak.png)',
  '地面底圖（選填）': 'Ground texture (optional)',
  '↶ 復原上一次加入': '↶ Undo last add',
  '清除上傳的素材': 'Clear uploaded assets',
  '上傳的圖只存在這個分頁。要當桌布，請把圖放進': 'Uploaded images live only in this tab. For a wallpaper, put them in',
  '並執行': 'and run',
  '（見 assets/README.md）。': '(see assets/README.md).',
  '圖片像素化': 'Pixelate an image',
  '任何圖片縮小、減色、抖動成像素畫；可去背後當成樹、石頭、地標放進場景。': 'Shrink, reduce colors and dither any image into pixel art; remove the background to drop it into the scene as a tree, rock or landmark.',
  '圖片': 'Image',
  '寬度（像素）': 'Width (pixels)',
  '抖動（規則網點，漸層更細）': 'Dither (ordered, smoother gradients)',
  '去背（支援複雜背景；主體需大致在畫面中央）': 'Remove background (works on busy backgrounds; keep the subject roughly centered)',
  '外框留白（一定是背景的範圍）': 'Border margin (always treated as background)',
  '放進場景當作': 'Add to scene as',
  '後方樹木（會倒映）': 'Back tree (reflected)',
  '草地上的花草': 'Flowers on the grass',
  '岸邊植物': 'Shore plant',
  '岸邊石頭': 'Shore rock',
  '水中石頭': 'Rock in the water',
  '地面底圖（整張鋪滿地面）': 'Ground texture (covers the whole ground)',
  '加入場景': 'Add to scene',
  '做成動態畫面': 'Animate it',
  '下載 PNG': 'Download PNG',
  '輸出與桌布': 'Export & wallpaper',
  '設成 Mac 動態桌布': 'Set as a Mac live wallpaper',
  '複製桌布網址': 'Copy wallpaper URL',
  '全螢幕預覽': 'Full-screen preview',
  '安裝免費的': 'Install the free',
  '（Mac App Store）。': 'app (Mac App Store).',
  'Plash 選單 → Add Website → 貼上網址。': 'Plash menu → Add Website → paste the URL.',
  '之後在這裡調整，重新複製網址即可。': 'Tweak things here later and copy the URL again.',
  '匯出檔案': 'Export files',
  '存 PNG': 'Save PNG',
  '秒數': 'Seconds',
  '錄影片': 'Record video',
  '重設全部': 'Reset everything',
  '像素池塘動畫': 'Pixel pond animation',
  '場景描述': 'Scene description',
  '用一句話描述，例：起風的秋天黃昏，荷葉很多的大池塘': 'Describe it in a sentence, e.g. windy autumn sunset, big pond with lots of lily pads',
  '同樣設定、換一個隨機場景': 'Same settings, new random scene',
  '配色預設': 'Palette preset',
  '常用地區': 'Popular places',
  '搜尋城市（英文，例：Kyoto）': 'Search a city (e.g. Kyoto)',
  '搜尋城市': 'Search a city',
  '桌布網址': 'Wallpaper URL',
  '語言': 'Language',

  // ---------- 面板 ----------
  '依離岸距離調水色：岸淺、池心深': 'Water color by distance from shore: light edges, deep center',
  '提亮靠近觀眾的半邊，讓天空映進來': 'Brighten the near half so the sky reflects in',
  '樹影：倒過來、壓扁、每行錯開一兩像素': 'Tree reflections: flipped, squashed, each row offset a pixel or two',
  '岸邊淺綠、濕泥壓暗、浪頭短亮線': 'Light green shallows, darker wet mud, short bright wave lines',
  '對岸泥土和草的倒影、水線輕輕挪動': 'Far-bank mud and grass reflections; the waterline shifts gently',
  '漣漪、偶爾一閃的亮點、落葉、荷葉浮動': 'Ripples, occasional glints, falling leaves, bobbing lily pads',
  '小徑': 'Path', '遺跡': 'Ruins', '火堆': 'Campfire', '遺落工具': 'Lost tools',
  '森林（範例）': 'Forest (sample)', '白天': 'Day', '黃昏': 'Sunset', '夜晚': 'Night', '秋天': 'Autumn', '櫻花': 'Cherry blossom',
  '天空': 'Sky', '淺水': 'Shallow', '深水': 'Deep', '草地': 'Grass', '樹葉': 'Foliage',
  '天空比例（0 = 俯瞰全是地面）': 'Sky share (0 = top-down, all ground)',
  '池塘大小': 'Water size',
  '樹木數量': 'Trees',
  '花草、蘆葦、石頭密度': 'Flowers, reeds and rocks',
  '水生動物（魚、錦鯉、鴨子、青蛙）': 'Water life (fish, koi, ducks, frogs)',
  '荷葉數量': 'Lily pads',
  '鳥類數量（跳、飛、涉水、潛水，依地點與水域隨機）': 'Birds (hop, fly, wade, dive — random per place and water body)',
  '風力（樹與花草擺動）': 'Wind (trees and plants sway)',
  '動畫速度': 'Animation speed',
  '倒影晃動（像素）': 'Reflection wobble (pixels)',
  '深淺漸層範圍': 'Depth gradient range',
  '漣漪頻率': 'Ripple frequency',
  '波光閃爍': 'Sparkles',
  '落葉數量': 'Falling leaves',
  '素材圖大小': 'Asset size',
  '解析度（像素寬，越小越粗）': 'Resolution (pixel width; smaller = chunkier)',
  'FPS 上限（桌布建議 12–24 省電）': 'FPS cap (12–24 saves power as a wallpaper)',
  '沒認出關鍵字，試試：黃昏、夜晚、秋天、櫻花、下雨、起風、平靜、森林、荷葉、大／小、波光、深水、花、荒涼、遺跡、火堆、工具':
    'No keywords recognized. Try: sunset, night, autumn, cherry, rain, wind, calm, forest, lily, big / small, sparkle, deep, flowers, barren, ruins, campfire, tools',
  '理解到：': 'Understood: ',
  '、': ', ',
  '水生動物': 'Water life', '俯瞰': 'Top-down', '大池塘': 'Big pond', '小池塘': 'Small pond', '波光': 'Glittering',
  '花草茂盛': 'Lush flowers', '荒涼': 'Barren', '下雨': 'Rainy', '起風': 'Windy', '平靜': 'Calm', '森林': 'Forest', '荷葉': 'Lots of lily pads',
  '已複製 ✓': 'Copied ✓', '請按 ⌘C': 'Press ⌘C', '瀏覽器不支援': 'Not supported by this browser',
  '錄影中…（{n} 秒）': 'Recording… ({n} s)',
  '沒找到水面：調高「水面偵測靈敏度」，或把「水線位置」拉到水面上緣。': 'No water found: raise “Water detection sensitivity” or drag “Waterline position” to the top edge of the water.',
  '天空的雲會慢慢飄。': 'Clouds in the sky drift slowly.',
  '水面 {p}% 的畫面，套上晃動、亮點、漣漪。': 'Water covers {p}% of the picture and gets wobble, glints and ripples.',
  '{w}×{h} px、{n} 色': '{w}×{h} px, {n} colors',
  '已加入 ✓': 'Added ✓',
  '後方樹木': 'back trees', '地面花草石': 'ground plants & rocks', '岸邊': 'shore', '水中': 'water', '地面底圖': 'ground texture',
  '目前素材（{from}）：{parts}；其餘用程式畫': 'Current assets ({from}): {parts}; everything else is generated',
  '用 npm run dev 開啟才讀得到 assets/ 資料夾；或直接上傳。': 'Open via npm run dev to read the assets/ folder, or upload directly.',
  '沒有素材圖，全部用程式畫。': 'No art assets; everything is generated.',
  'assets/ 資料夾': 'assets/ folder', '上傳': 'upload',

  // ---------- 地區面板 ----------
  '在地上跳': 'hopping on the ground', '跳著覓食': 'hopping and foraging', '飛過天空': 'flying across the sky', '在淺水涉水': 'wading in the shallows',
  '站著等魚、突然啄下': 'standing still, then striking at fish', '停在岸邊': 'perched on the bank', '潛水捕魚': 'diving for fish',
  '貼著水面飛': 'skimming the water', '在空中盤旋': 'circling overhead', '站在沙灘上': 'standing on the beach', '浮在水面': 'floating on the water',
  '追著浪跑': 'chasing the waves', '在沙灘上走': 'walking on the beach', '浮在水面划水': 'paddling on the water', '蹲在荷葉上': 'sitting on a lily pad',
  '{m} 月': 'Month {m}', '我的位置': 'My location', '自訂地點': 'Custom place',
  '讀取 {place} 的海拔、天氣與去年一整年的氣候…': 'Loading elevation, weather and last year’s climate for {place}…',
  '連不上 Open-Meteo（{err}），氣候改用緯度估算。': 'Could not reach Open-Meteo ({err}); estimating climate from latitude.',
  '沒有取得位置權限': 'Location permission denied',
  '搜尋中…': 'Searching…',
  '找不到，試試英文名稱（例：Taipei、Kyoto）': 'Nothing found. Try the English name (e.g. Taipei, Kyoto)',
  '搜尋失敗：{err}': 'Search failed: {err}',
  '先選地點': 'Pick a place first',
  '查詢中 {n}/{total}': 'Checking {n}/{total}',
  '海拔 {m} m': 'elevation {m} m', '當地 {time}': 'local time {time}', '（估算）': ' (estimated)',
  '未選地點：預設為溫帶歐洲的夏天池塘（{kp}）。選個地點，物種與配色就會照當地來。': 'No place set: defaults to a summer pond in temperate Europe ({kp}). Pick a place and species and colors will follow it.',
  '{realm}原生、適應{climate}氣候': 'native to the {realm} realm, suited to a {climate} climate',
  '行為：{act}': 'behavior: {act}',
  'GBIF 100 km 內 {n} 筆紀錄': '{n} GBIF records within 100 km',
  '；': '; ',
  '已排除 {n} 種在這附近沒有觀察紀錄的候選物種': 'Excluded {n} candidate species with no observation records nearby',
  '晴': 'Clear', '多雲': 'Cloudy', '霧': 'Fog', '毛毛雨': 'Drizzle', '雨': 'Rain', '雪': 'Snow', '陣雨': 'Showers', '陣雪': 'Snow showers', '雷雨': 'Thunderstorm',
  '台北': 'Taipei', '東京': 'Tokyo', '倫敦': 'London', '紐約': 'New York', '雪梨': 'Sydney', '奈洛比': 'Nairobi', '馬瑙斯（亞馬遜）': 'Manaus (Amazon)',
  '開羅': 'Cairo', '雷克雅維克': 'Reykjavík', '開普敦': 'Cape Town', '檀香山': 'Honolulu', '奧克蘭': 'Auckland', '新加坡': 'Singapore', '鳳凰城': 'Phoenix', '峇里島': 'Bali',

  // ---------- 生態 ----------
  '古北界（歐洲、北非、溫帶亞洲）': 'Palearctic (Europe, North Africa, temperate Asia)', '新北界（北美）': 'Nearctic (North America)',
  '新熱帶界（中南美）': 'Neotropical (Central & South America)', '非洲熱帶界': 'Afrotropical',
  '印度馬來界（南亞、東南亞、華南）': 'Indomalayan (South & Southeast Asia, South China)', '澳大拉西亞界（澳洲、紐西蘭、新幾內亞）': 'Australasian (Australia, New Zealand, New Guinea)',
  '大洋洲界（太平洋島嶼）': 'Oceanian (Pacific islands)', '南極界': 'Antarctic',
  '熱帶（最冷月 ≥ 18°C）': 'Tropical (coldest month ≥ 18°C)', '乾燥（降水少於蒸發）': 'Arid (less rain than evaporation)',
  '溫帶（最冷月 0–18°C）': 'Temperate (coldest month 0–18°C)', '大陸型（最冷月 < 0°C）': 'Continental (coldest month < 0°C)', '寒帶（最暖月 < 10°C）': 'Polar (warmest month < 10°C)',
  '春': 'spring', '夏': 'summer', '秋': 'autumn', '冬': 'winter', '熱帶（全年）': 'tropical (no seasons)',
  // 物種名
  '夏櫟': 'English oak', '歐洲赤松': 'Scots pine', '垂柳': 'Weeping willow', '櫸木': 'Japanese zelkova', '樟樹': 'Camphor tree',
  '染井吉野櫻': 'Yoshino cherry', '黑松': 'Japanese black pine', '紅花槭': 'Red maple', '北美喬松': 'Eastern white pine', '落羽杉': 'Bald cypress',
  '歐洲雲杉': 'Norway spruce', '黑雲杉': 'Black spruce', '興安落葉松': 'Dahurian larch', '垂枝樺': 'Silver birch', '赤桉': 'River red gum',
  '白千層': 'Broad-leaved paperbark', '孟加拉榕': 'Banyan', '榕樹': 'Chinese banyan', '吉貝木棉': 'Kapok', '傘刺金合歡': 'Umbrella thorn acacia',
  '椰子': 'Coconut palm', '海棗': 'Date palm', '加州蒲葵': 'California fan palm', '大王椰子': 'Cuban royal palm', '鐮葉羅漢松': 'Outeniqua yellowwood',
  '阿薩伊椰': 'Açaí palm', '湖棕': 'Moriche palm', '林投': 'Screwpine', '多形鐵心木': 'ʻŌhiʻa lehua', '黃槿': 'Sea hibiscus',
  '木麻黃': 'Coastal she-oak', '海岸松': 'Maritime pine', '扭葉松（海岸型）': 'Shore pine', '紐西蘭聖誕樹': 'Pōhutukawa',
  '仙人掌（團扇屬）': 'Prickly pear', '北極柳': 'Arctic willow',
  '白睡蓮': 'European white water lily', '香睡蓮': 'Fragrant water lily', '藍睡蓮': 'Blue water lily', '蓮': 'Sacred lotus',
  '白花睡蓮（美洲）': 'Dotleaf water lily', '亞馬遜王蓮': 'Giant Amazon water lily', '香蒲': 'Cattail',
  '鯉魚': 'Common carp', '鯽魚': 'Goldfish (crucian)', '錦鯉': 'Koi', '河鱸': 'European perch', '藍鰓太陽魚': 'Bluegill', '大口黑鱸': 'Largemouth bass',
  '尼羅吳郭魚': 'Nile tilapia', '巴西鯧（大蓋巨脂鯉）': 'Pacu', '蟲紋麥鱈鱸': 'Murray cod', '北極紅點鮭': 'Arctic char', '線鱧': 'Striped snakehead',
  '莫三比克吳郭魚': 'Mozambique tilapia', '金鱸': 'Golden perch', '烏魚（鯔）': 'Flathead grey mullet',
  '湖蛙': 'Marsh frog', '黑斑側褶蛙': 'Black-spotted pond frog', '沼蛙': 'Guenther’s frog', '美國牛蛙': 'American bullfrog', '虎紋蛙': 'Indian bullfrog',
  '南美牛蛙': 'Smoky jungle frog', '非洲虎紋蛙': 'African tiger frog', '安哥拉河蛙': 'Angola river frog', '咆哮草蛙': 'Growling grass frog',
  '綠頭鴨': 'Mallard', '花嘴鴨': 'Eastern spot-billed duck', '太平洋黑鴨': 'Pacific black duck', '疣鼻栖鴨': 'Muscovy duck', '白臉樹鴨': 'White-faced whistling duck',
  '黃嘴鴨': 'Yellow-billed duck', '樹鴨': 'Lesser whistling duck', '夏威夷鴨': 'Hawaiian duck', '歐絨鴨': 'Common eider',
  '麻雀': 'Eurasian tree sparrow', '家麻雀': 'House sparrow', '旅鶇': 'American robin', '家八哥': 'Common myna', '白鶺鴒': 'White wagtail',
  '棕灶鳥': 'Rufous hornero', '黑白扇尾鶲': 'Willie wagtail', '巨嘴鴉': 'Large-billed crow', '喜鵲': 'Eurasian magpie', '短嘴鴉': 'American crow',
  '斑駁鴉': 'Pied crow', '黑背鐘鵲': 'Australian magpie', '蒼鷺': 'Grey heron', '大藍鷺': 'Great blue heron', '小白鷺': 'Little egret',
  '大白鷺': 'Great egret', '黑冠白頸鷺': 'Cocoi heron', '白臉鷺': 'White-faced heron', '岩鷺': 'Pacific reef heron', '普通翠鳥': 'Common kingfisher',
  '帶魚狗': 'Belted kingfisher', '白眉翡翠': 'Sacred kingfisher', '冠翠鳥': 'Malachite kingfisher', '家燕': 'Barn swallow', '洋燕': 'Welcome swallow',
  '黑鳶': 'Black kite', '魚鷹': 'Osprey', '紅尾鵟': 'Red-tailed hawk', '白腹海鵰': 'White-bellied sea eagle', '白頭海鵰': 'Bald eagle',
  '黑尾鷗': 'Black-tailed gull', '銀鷗': 'European herring gull', '澳洲紅嘴鷗': 'Silver gull', '黑背鷗': 'Kelp gull', '笑鷗': 'Laughing gull',
  '鸕鷀': 'Great cormorant', '角鸕鷀': 'Double-crested cormorant', '美洲鸕鷀': 'Neotropic cormorant', '褐鵜鶘': 'Brown pelican', '澳洲鵜鶘': 'Australian pelican',
  '白鵜鶘': 'Great white pelican', '三趾濱鷸': 'Sanderling', '東方環頸鴴': 'Kentish plover', '雪鴴': 'Snowy plover', '太平洋金斑鴴': 'Pacific golden plover',
  '紅頂鴴': 'Red-capped plover', '非洲企鵝': 'African penguin', '麥哲倫企鵝': 'Magellanic penguin', '小藍企鵝': 'Little penguin', '巴布亞企鵝': 'Gentoo penguin',
  // 出現理由
  '原生中國，水邊廣泛栽植': 'native to China, widely planted by water',
  '日本、韓國公園水邊常見': 'common by water in Japanese and Korean parks',
  '東亞海岸防風林': 'East Asian coastal windbreak',
  '美國東南部沼澤的代表樹': 'the signature tree of southeastern US swamps',
  '澳洲河岸最常見的桉樹': 'the most common eucalypt on Australian riverbanks',
  '非洲莽原的傘形樹': 'the umbrella tree of the African savanna',
  '熱帶海岸': 'tropical coasts', '綠洲': 'oases',
  '亞馬遜河口的氾濫林': 'flooded forest of the Amazon estuary',
  '熱帶、亞熱帶太平洋海岸': 'tropical and subtropical Pacific coasts',
  '夏威夷原生': 'native to Hawaiʻi',
  '熱帶海岸防風林（針狀小枝）': 'tropical coastal windbreak (needle-like twigs)',
  '仙人掌只原生於美洲': 'cacti are native only to the Americas',
  '苔原只有貼地的矮灌木': 'tundra has only low, ground-hugging shrubs',
  '亞馬遜河流域': 'Amazon basin',
  '全世界淡水濕地都有': 'freshwater wetlands worldwide',
  '東亞公園、庭園池塘的觀賞魚；野外池塘不會有': 'ornamental fish of East Asian park and garden ponds; never in wild ponds',
  '熱帶到溫帶的沿岸淺水': 'tropical to temperate coastal shallows',
  '原生歐亞，已歸化到各大洲城鎮': 'native to Eurasia, naturalized in towns on every continent',
  '幾乎全世界的溫暖濕地都有': 'warm wetlands almost worldwide',
  '夏候鳥：冬天飛到熱帶': 'summer visitor; winters in the tropics',
  '全世界的大型水域都有': 'large waters worldwide',
  '幾乎全世界沙灘的冬候鳥': 'winter visitor to beaches almost worldwide',
  '企鵝只住在南半球，這種在南非、納米比亞海岸': 'penguins live only in the Southern Hemisphere; this one on South African and Namibian coasts',
};
const ZH = Object.fromEntries(Object.entries(EN).map(([zh, en]) => [en, zh]));
