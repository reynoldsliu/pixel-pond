# assets/ — 放你自己的素材圖

沒有素材圖時，所有東西都由程式畫（[src/sprites/library.js](../src/sprites/library.js)，顏色會跟著配色變）。
放了素材圖的「用途」改用你的圖，其他用途仍由程式畫，所以可以只換樹、只換石頭。

## 1. 命名規則：`<分類>-<用途>-<名字>.png`

全小寫，名字只能用英文字母、數字、`-`。

| 分類 | 意思 |
|---|---|
| `flora` | 花草樹木（會隨風擺動，越靠上擺越多） |
| `rock` | 石頭 |
| `prop` | 人造物：遺跡、遺落的工具、火堆… |
| `terrain` | 地面底圖（拉伸填滿畫面，池塘和岸邊泥土畫在上面） |

| 用途 | 放在哪裡 |
|---|---|
| `back` | 池塘後方與兩側（會倒映在水裡、葉子從這裡落下） |
| `ground` | 散布在草地上（小花、草叢、蘑菇、小石頭） |
| `shore` | 近岸與側岸的水線上（蘆葦、大石頭；水中會有斷續的接觸亮線） |
| `water` | 立在池塘中間（水中石頭） |
| `feature` | 地標，放在近側與左右的草地上。名字含 `ruin` 歸「遺跡」、含 `fire`/`camp` 歸「火堆」（會自動加上跳動火焰），其他歸「遺落工具」，對應面板的三個勾選框 |

範例：

```
flora-back-oak.png         flora-back-pine-2.png      flora-ground-flowers-red.png
flora-shore-reeds.png      rock-shore-boulder.png     rock-water-stone.png
prop-feature-ruin-pillar.png   prop-feature-campfire.png   prop-feature-shovel.png
terrain-ground-meadow.png
```

## 2. 放好之後產生清單

瀏覽器沒辦法列出資料夾內容，所以加減圖之後要執行一次：

```bash
npm run assets
```

它會把符合規則的檔名寫進 `assets/manifest.json`，不符合的會列出來提醒你改名。
之後用 `npm run dev`（或部署後的網址）開啟就會套用，複製出的桌布網址在 Plash 裡也會用同一批圖。

## 3. 素材要求

- **透明背景**。半透明邊緣會被當成全透明或全不透明（像素畫不要毛邊）。
- **腳在圖片最下緣**。程式會裁掉透明邊，以底邊中央當作根部，倒影從水線開始翻轉。
- **1:1 像素**最好（一個美術像素 = 一個圖片像素）。320 寬的畫面裡，樹約 20–40 px 高最合適。
  整包素材共用一個縮放倍率，所以石頭會維持比樹小；最高的圖超過 40 px（例如 AI 輸出的大圖）時，
  整包會等比縮到最高約 34 px。面板的「素材圖大小」滑桿可以再微調。
- **同一批素材用同一種風格與光源方向**（程式素材都是左上受光），放在一起才不會打架。

## 素材庫 `library/`（不自動載入）

`library/` 底下的圖不會進 manifest，想用哪張就複製到 `assets/` 其他位置再跑 `npm run assets`。

- `library/kenney/`：[Kenney Tiny Town](https://kenney.nl/assets/tiny-town) 1.1（CC0，授權見 `LICENSE-kenney-tiny-town.txt`）。
  18 張：高樹、小樹、灌木、新芽、蘑菇、告示牌、水井、蜂窩、木頭、陶罐、木桶、十字鎬、乾草叉、斧頭。
  它是 16 px 的俯視圖塊風格、顏色固定、沒有外框與光影層次，和範例的畫風差很多，所以預設不載入。
- `library/builtin/`：`npm run assets:builtin` 輸出的程式素材範本。

**混用素材圖要注意**：程式畫的場景會依所在位置的樹蔭壓暗物件、在地上畫投影，素材圖也會套用；
但素材本身的外框、色相偏移、光源方向要和範例一致（深色非黑外框、暗部偏藍綠、亮部偏黃、左上受光），不然放進來一定突兀。

## 4. 素材從哪裡來

- **內建範本**：`npm run assets:builtin` 會把程式素材庫每種輸出 3 張到 `assets/library/builtin/`（不會自動載入）。
  可以拿去 Aseprite / Pixelorama 修改，再把喜歡的複製到 `assets/` 上層。
- **AI 生成**：例如 SpriteCook，用一張風格參考圖一次產出整組。英文描述通常比較準，例如：
  `pixel art oak tree, 3/4 top-down, dark teal outline, hue-shifted shading, transparent background, light from top-left, 48x64`
- **免費素材包**：Kenney、OpenGameArt、itch.io。要公開上線請挑 **CC0** 或允許再散布的授權，
  並遵守署名要求；把授權檔一起放進這個資料夾。

## 只想試試看？

不用放檔案：在面板的「素材圖」區直接上傳（依檔名分類，不符合規則的當成後方樹木）。
上傳的圖只存在當下的分頁，可以拿來存 PNG、錄影片，但不會跟著桌布網址走。
