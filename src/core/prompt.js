import { PALETTES } from './config.js';

// 一句話描述 → 設定差異（關鍵字規則）
// ponytail: 關鍵字規則，不接 LLM。上線後想接 API，只要換掉 parsePrompt（回傳同樣的 {patch, matched}）。
// 時段規則放前面（整組配色），季節規則放後面（只覆蓋樹與草），所以「秋天黃昏」= 黃昏天空 + 秋葉。
// props（p 小徑 / r 遺跡 / f 火堆 / t 工具）會累加：「遺跡旁的火堆」= 'rf'。
export const PROMPT_RULES = [
  ['黃昏', /sunset|dusk|黃昏|黄昏|夕陽|夕阳|傍晚/i, { palette: 'sunset' }],
  ['夜晚', /night|moon|夜|月/i, { palette: 'night', sparkles: 1.2 }],
  ['白天', /day|morning|白天|早晨|清晨|晴/i, { palette: 'day' }],
  ['森林', /forest|wood|森林|樹林|树林/i, { palette: 'forest', trees: 20 }],
  ['秋天', /autumn|fall|秋|楓|枫/i, { foliage: '#c0602a', leaf: '#e8a03a', grass: '#8f9a48', leaves: 14 }],
  ['櫻花', /sakura|cherry|spring|櫻|樱|春/i, { foliage: '#e594b2', leaf: '#f7c6d8', leaves: 12 }],
  ['下雨', /rain|storm|雨/i, { ripples: 2, sparkles: 0.1 }],
  ['起風', /wind|breez|風|风/i, { wobble: 2, wind: 2.5, leaves: 18, speed: 1.4 }],
  ['平靜', /calm|still|quiet|peace|平靜|平静|安靜|安静|寧靜|宁静/i, { wobble: 0.5, wind: 0.4, speed: 0.6, ripples: 0.2 }],
  ['荷葉', /lily|lotus|荷/i, { lilies: 12 }],
  ['水生動物', /fish|koi|duck|frog|魚|鱼|鯉|鲤|鴨|鸭|蛙/i, { fauna: 2.5 }],
  ['天空', /sky|horizon|cloud|天空|地平線|雲|云/i, { horizon: 0.35 }],
  ['俯瞰', /top.?down|overhead|俯瞰|俯視|鳥瞰/i, { horizon: 0 }],
  ['大池塘', /big|large|lake|大|湖/i, { pond: 0.95 }],
  ['小池塘', /small|tiny|小/i, { pond: 0.5 }],
  ['波光', /sparkl|shin|glitter|閃|闪|波光/i, { sparkles: 1.6 }],
  ['深水', /deep|深/i, { depth: 24 }],
  ['花草茂盛', /flower|bloom|meadow|花|草原/i, { decor: 2 }],
  ['荒涼', /barren|empty|desolate|荒/i, { decor: 0.3 }],
  ['小徑', /path|trail|road|小徑|小径|小路|步道/i, { props: 'p' }],
  ['遺跡', /ruin|temple|遺跡|遗迹|廢墟|废墟|古蹟/i, { props: 'r' }],
  ['火堆', /campfire|bonfire|fire|火堆|營火|营火|篝火/i, { props: 'f' }],
  ['遺落工具', /tool|shovel|axe|bucket|工具|鏟|铲|斧|桶/i, { props: 't' }],
];

export function parsePrompt(text) {
  const patch = {}, matched = [];
  for (const [label, re, p] of PROMPT_RULES) {
    if (!re.test(text)) continue;
    const props = (patch.props || '') + (p.props || '');
    Object.assign(patch, p.palette ? PALETTES[p.palette] : {}, p);
    if (props) patch.props = props;
    matched.push(label);
  }
  return { patch, matched };
}
