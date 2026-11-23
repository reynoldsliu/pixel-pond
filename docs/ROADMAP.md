# Pixel Pond 最佳化路線圖

2026-11 調查同類工具後整理。✅ = 這一輪已完成。

## 1. 同類工具調查

| 工具 | 類型 | 值得借鏡 | 和 Pixel Pond 的差別 |
|---|---|---|---|
| [Image-to-Pixel](https://github.com/Tezumie/Image-to-Pixel)（MIT） | 網頁版圖片轉像素畫 | 16 種抖動（Bayer、Floyd–Steinberg、Atkinson…）、24 組內建調色盤，可匯入 .gpl/.hex/Lospec；引擎、編輯器、影片拆成獨立模組；WebGL 與 CPU 兩條路徑產出相同像素 | 只做轉換，不做動態場景 |
| [Pixelizer](https://vorvek.itch.io/pixelizer)、[SLK_img2pixel](https://captain4lk.itch.io/slk-img2pixel)、[MakeItPixel](https://www.github.com/MiguelMJ/MakeItPixel) | 桌面版轉換器 | 流程固定為「調色盤 → 縮小 → 量化 → 抖動」；作者建議像素畫用 Bayer 4×4 | 要安裝，沒有動態 |
| [Landscape Generator](https://westboy.itch.io/landscape-generator)（MIT） | 網頁版隨機風景 | 每個參數有最小／最大值，設成一樣就固定；可以分圖層匯出做視差 | 向量風，不會動 |
| [Pickcells](https://github.com/shikaan/pickcells)、itch.io 上的 [procedural pixel-art 工具](https://itch.io/tools/html5/platform-web/tag-pixel-art/tag-procedural) | 隨機像素畫 | 一鍵隨機、做出來馬上能分享 | 多半只輸出靜態圖 |
| [Methodox Wallpaper Generator](https://methodox.itch.io/wallpaper-generator) | 桌面版桌布產生器 | 有預設組；可做能無縫捲動的拼接圖 | 動畫還在規劃中 |
| [PixelFX Piper](https://www.producthunt.com/products/pixelfx-piper)、wallpapers.com 的動態桌布 | 替現成圖片加特效 | 4 秒無縫循環、視差 | 不產生內容 |
| [Plash](https://github.com/sindresorhus/Plash) | 把網頁當 Mac 桌布 | 我們的發佈管道 | 評論提到跑影片或 GIF 時相當耗資源 |

**定位**：調查到的工具沒有一個同時做到「隨機產生寫實像素場景 + 無縫循環動畫 + 網頁當桌布 + 照片轉動態像素畫」。
功能上這是最大的差異點；長期最大的風險是畫風和效能。

## 2. 需求面

| 優先 | 項目 | 原因 |
|---|---|---|
| P0 | ✅ 照片／像素化結果可以取消、復原 | 試錯成本要低 |
| P0 | 桌布模式省電：Plash 裡跑 24 fps 的全螢幕 canvas，偵測到使用電池時自動降到 12 fps | Plash 跑動畫內容本來就耗資源（見上表） |
| P1 | 預設組（「黃昏森林」「雨天」「夜晚螢火蟲」…）＋縮圖選單 | 新使用者不用碰滑桿就有好看的結果（Methodox、Landscape Generator 都這樣做） |
| P1 | 照片場景也能當桌布：照片存進 IndexedDB，桌布網址帶 id | 目前照片只能錄影片 |
| P1 | 調色盤匯入（Lospec 網址 / .hex 貼上） | Image-to-Pixel 的主力功能。Lospec 有官方單一調色盤 JSON：`lospec.com/palette-list/<slug>.json` |
| P2 | ✅ 新水域：大型湖泊、海岸、海洋；雪地與落葉季依地點季節自動出現。夜晚螢火蟲未做 | 架構已經可以直接加 |
| P1 | ✅ 現實同步：定位 / 搜尋 / 常用地區 → 海拔、氣候（柯本）、季節、太陽高度、即時天氣；物種依地理區與氣候篩選，再用 GBIF 100 km 內觀察紀錄確認 | 每個元素都要在當地真的存在 |
| P1 | ✅ 鳥類：11 種類型、行為依地圖隨機 | 畫面更有生氣 |
| P2 | 分圖層匯出（天空／遠景／水／前景）做視差 | Landscape Generator 有，做遊戲背景的人會用 |
| P2 | 更多抖動演算法（Floyd–Steinberg、Atkinson） | 像素化工具的基本款 |

## 3. 美術面

1. **同一套光照規則**：程式素材、照片轉換、上傳素材都照「左上受光、暗部偏藍綠、亮部偏暖」。✅ 照片已經套用色相偏移；
   下一步是上傳素材自動做一次色相偏移，讓 AI 生成圖不突兀。
2. **配色要有限制**：真正的像素畫通常 16–32 色。建議全場景共用一個總調色盤（目前水面 10 色＋各素材各自 7 階，總色數沒有上限），
   最後統一量化，畫面會更整齊。
3. **動態要有層次**：目前的動態是水、雲、樹、動物。可以加的低成本動態：草地上偶爾飄過的雲影、黃昏時的螢火蟲、雨天的斜線。
4. **照片轉換的弱點**：灰色海面要手動拉水線；天空裡有大量雜色時不拆雲。可以考慮讓使用者在畫面上點一下「這是水」「這是天空」當種子點。

## 4. UI／互動面

- ✅ 面板分成可收合的群組；選了照片後畫面下方會出現「取消照片」。
- ✅ 照片可以直接拖到畫面上；⌘/Ctrl + Enter 套用描述。
- 建議：
  - **畫面優先**：窄螢幕時面板改成底部抽屜，畫面固定在上方（目前要往下捲才看得到效果）。
  - **即時回饋**：滑桿拖動時用較低解析度預覽，放開才完整重建（實測 Node：`buildScene` 在 320 寬約 100 ms、480 寬約 175 ms；每一格只要 6–8 ms，所以卡頓來自重建，不是播放）。
  - **復原一致**：除了素材之外，設定也可以復原（cfg 本來就是不可變的網址字串，存一份歷史就好）。
  - **鍵盤**：`R` 換場景、`C` 對照、`Space` 暫停（要避開輸入框）。
  - **無障礙**：滑桿的 `<output>` 加 `aria-live`；所有勾選框都已經有 `<label>`。

## 5. 開發面

### ✅ 這一輪完成的架構調整

- 1 個 1,100 行的 `pond.js`、1 個 460 行的 `sprites.js`、1 個 300 行的 `app.js` 拆成 `src/` 底下的 ES modules，
  分層與相依方向見 README「程式架構」。
- **單一職責（SRP）**：設定驗證與網址編碼移到 `core/config.js`（純函式，有測試）；畫布迴圈、素材集合、每個面板各自一個檔案。
- **開放封閉（OCP）**：場景依 `scene.type` 從註冊表分派，加新場景不用改 `renderFrame`；每個場景自己帶 `period`，錄影不再寫死判斷式。
- **依賴反轉（DIP）**：面板只依賴傳進來的 `app`（狀態 + 事件），彼此不 import；下層模組完全不碰 DOM。
- **DRY**：滑桿的 min/max 和網址驗證共用 `RANGES`；檔案輸入「選完清空」、PNG 輸出共用 `ui/dom.js`。
- **不可變狀態**：素材集合每次改動產生新快照，復原就是換回上一份。
- 測試擴充：設定驗證、網址編碼、場景週期。

### 接下來

1. ✅ **池塘場景依圖層拆開**：原本 650 行的 `scenes/pond.js` 拆成 `scenes/pond/` 底下 6 個檔案（版面、地形天空、物件、水面、生命、組裝）。
   每幀改成 pass 清單（色號階段 5 個、顏色階段 5 個），加效果只要加一個 pass。拆完後畫面逐像素相同，有快照測試把關。
2. **型別**：加 JSDoc `@typedef Scene`，再加 `// @ts-check`。不需要建置，VS Code 就會檢查。
3. **效能**：`buildPhotoScene` 與 `segment` 放進 Web Worker，大圖時 UI 不會卡；之後可以考慮像 Image-to-Pixel 那樣，
   讓逐像素的水面晃動走 WebGL shader，CPU 版本保留給測試。
4. ✅ **快照測試**：4 組設定 × 7 個時間點的畫面 hash，重構時畫面被改到就會失敗。
5. **CI**：GitHub Actions 跑 `npm test`，推到 main 時自動部署到 GitHub Pages（Image-to-Pixel 也是這樣做）。
6. **版本控制**：專案目前不是 git repo，建議先 `git init`，大型重構才有退路。

## 這一輪的取捨

改成 ES modules 之後，**不能再直接雙擊 `index.html` 開啟**（瀏覽器不允許從 `file://` 載入模組），要用 `npm run dev`。
原本讀取 `assets/` 資料夾就已經需要本機伺服器，部署到 GitHub Pages 和用 Plash 開啟都不受影響。
