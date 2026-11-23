// 打包：只複製網頁執行需要的檔案（不含測試、文件、工具），可直接放上任何靜態主機。
// 用法：npm run pack [-- 目的資料夾]，預設 dist/
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] || 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'assets'), { recursive: true });
for (const f of ['index.html', 'style.css', 'src', 'assets/manifest.json']) cpSync(f, resolve(out, f), { recursive: true });
console.log('packed →', out);
