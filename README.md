# 娃娃車 GPS 追蹤測試版

Firebase 設定已填好，無需修改 config.js。此專案為重新製作的純靜態網頁，不需要安裝套件或編譯。

## 檔案
- index.html：入口
- sender.html：隨車手機 GPS 發射端
- viewer.html：家長端、目的地、直線距離與簡易 ETA
- style.css：手機版樣式
- config.js：Firebase 與車輛參數
- README.md：本說明

## 1. Firebase 確認
專案 bus-tracker-aa9a8，車輛 demo-bus-001。
資料庫：https://bus-tracker-aa9a8-default-rtdb.firebaseio.com/
程式寫入／監聽：vehicles/demo-bus-001/latest

已填入設定不代表雲端權限已驗證。此版本沒有登入功能，需資料庫允許該路徑的未登入讀寫，才能進行測試。

若出現 PERMISSION_DENIED，到 Firebase Console → 專案 → Realtime Database → Rules 檢查。
以下為「僅限短期、非真實接送資料測試」的路徑限制範例。它仍允許任何人讀取及竄改此車輛位置。請勿用於載有兒童的正式接送。
如果資料庫還有其他應用程式，請先保留既有規則，再合併需要的路徑；不要直接覆蓋其他規則。

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "vehicles": {
      "demo-bus-001": {
        "latest": {
          ".read": true,
          ".write": true,
          ".validate": "newData.hasChildren(['latitude', 'longitude', 'accuracy', 'gpsTimestamp', 'updatedAt'])",
          "latitude": { ".validate": "newData.isNumber() && newData.val() >= -90 && newData.val() <= 90" },
          "longitude": { ".validate": "newData.isNumber() && newData.val() >= -180 && newData.val() <= 180" },
          "accuracy": { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "gpsTimestamp": { ".validate": "newData.isNumber()" },
          "updatedAt": { ".validate": "newData.isNumber()" },
          "speedKmh": { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "$other": { ".validate": false }
        }
      }
    }
  }
}
```

測試結束請移除公開的 .read/.write 授權並刪除測試座標。正式使用前需加入 Firebase Authentication 與依司機／家長身分限制的 Rules；只有 apiKey 並不能保護位置資料。此 ZIP 不會修改雲端規則。

## 2. GitHub Pages 部署
1. 解壓縮 kindergarten_bus_tracker_configured.zip。
2. 登入 GitHub，建立新儲存庫，例如 kindergarten-bus-tracker。使用免費方案時可選 Public；不要上傳私人資料。
3. 在儲存庫選 Add file → Upload files，把六個檔案放到儲存庫最外層，按 Commit changes。請上傳解壓縮後的檔案，不是 ZIP。
4. 確認儲存庫根目錄能直接看到 index.html、sender.html、viewer.html、style.css、config.js、README.md。
5. Settings → Pages → Build and deployment。
6. Source 選 Deploy from a branch，Branch 選 main，資料夾選 / (root)，按 Save。
7. 等待部署成功；可在 Actions 查看進度，回 Pages 查看實際網址，通常為：
   https://你的帳號.github.io/kindergarten-bus-tracker/
8. 使用這個 HTTPS 網址開啟首頁。發射端網址末尾是 /sender.html，家長端是 /viewer.html。

若看到 404，確認部署完成、分支及目錄正確，檔名小寫。若更新後仍是舊畫面，重新整理或重新開啟 Safari 分頁。
直接在「檔案」App 開啟 HTML 並非部署；瀏覽器定位需要 HTTPS 或本機 localhost。

## 3. 用兩支 iPhone 測試
1. 兩支手機都開啟網路。到 iPhone 設定 → 隱私權與安全性 → 定位服務，確認定位已開啟；允許 Safari 網站使用位置及精確位置（選項依 iOS 版本可能不同）。
2. 手機 A 用 Safari 開啟 HTTPS 網站 → GPS 發射端 → 開始 GPS 追蹤並上傳 → 允許定位。
3. 到戶外等待定位，確認座標、精度與「最後成功上傳」開始出現。
4. 手機 B 開家長端。只有設定「用這支手機目前位置」時才需要授權家長手機定位；單純查看車輛不需要。
5. 按「用這支手機目前位置」，或自行輸入接送點經緯度後儲存。目的地是固定座標，僅存在此瀏覽器 localStorage，不會跟著家長手機移動。
6. A 手機步行移動，B 應更新座標、速度、精度、最後更新、直線距離與 ETA。GPS 速度可能為空，此時使用 25 km/h 估算。
7. A 按停止追蹤，B 保留最後位置；定位時間超過 60 秒後應提示過期並停止 ETA。
8. 測試斷網與重新連線：斷網期間不保證更新；恢復網路並取得新 GPS 資料後應恢復。

發射端保持 Safari 在前景與螢幕亮起。iPhone 鎖屏、背景執行或省電狀態可能暫停網頁與 GPS；此網頁不保證背景追蹤，加入主畫面也不代表有原生 App 背景定位能力。測試時可暫時延長自動鎖定時間，結束後恢復原設定。不要由駕駛行進間操作。

## 資料與計算
latest 每次以 set 覆寫，因此只保留最後位置，不儲存路線歷史：
- latitude、longitude：十進位經緯度
- speedKmh：GPS 的 m/s × 3.6；無資料為 null（Firebase 會省略該欄位）
- accuracy：公尺
- gpsTimestamp：定位取得時間，Unix 毫秒
- updatedAt：Firebase 伺服器上傳時間，Unix 毫秒

watchPosition 的更新頻率由裝置與瀏覽器決定，不保證每秒。僅在已連線時送出新定位，若上傳尚未完成，保留最新待送位置。停止定位無法撤回已送出的上傳。

距離使用 Haversine 球面直線距離。ETA = 距離 ÷ 速度：
- GPS 速度 >= minGpsSpeedKmh (3)：採用 GPS 速度。
- 無速度或速度 < 3：採用 fallbackSpeedKmh (25)。
- 定位超過 60 秒或家長端斷線：暫停 ETA。
- 不含道路、交通、停靠或行車方向。停車時仍可能顯示估算值，不等於已抵達或即將抵達。

家長端以 GPS 時間判斷資料年齡，請讓發射手機日期時間維持自動設定。Google 地圖連結在點擊後會把目前座標交給 Google；沒有內嵌地圖或路線服務。
需連網載入固定版本 Firebase JS SDK 12.2.1 (gstatic.com)。

## 常見問題
- 載入失敗：檢查網路與 gstatic.com 是否被阻擋。
- 讀取／上傳失敗：檢查 Realtime Database 的 URL、Rules 是否允許此路徑讀寫，以及 Firebase 服務配額。
- 沒有定位：確認 HTTPS、Safari 位置權限，移至戶外再試。
- 速度顯示「無速度資料」：裝置沒有提供 GPS 速度；不是上傳故障。
- 多支手機一起發射：會互相覆寫同一車輛，測試時只開一個發射端。
- 停止後還有位置：設計上保留最後座標，家長端會顯示資料年齡。

## 驗證範圍
交付前檢查 JavaScript 語法、Firebase 設定、距離公式與模擬資料流程。未連線操作你的 Firebase、未修改 Rules、未部署 GitHub Pages，也未進行實體 iPhone GPS 測試。請依上方步驟完成兩機實測。

## 官方參考
- [Firebase 讀寫資料](https://firebase.google.com/docs/database/web/read-and-write)
- [GitHub Pages 發布來源設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [瀏覽器 watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)

