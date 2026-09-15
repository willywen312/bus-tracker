# 娃娃車即時追蹤 V2

網站：https://willywen312.github.io/bus-tracker/

## 部署（GitHub Pages）

1. 解壓縮 `bus-tracker-v2.zip`，把 ZIP 內所有檔案放到現有 GitHub `bus-tracker` repository 的 Pages 發布目錄（目前為 main 根目錄），同名檔案直接更新。不要額外套一層資料夾。
2. GitHub → Settings → Pages：確認使用 main 分支、`/ (root)`；若原本採用其他發布來源，將檔案放到該來源。
3. 等待 Pages 部署完成，開啟 https://willywen312.github.io/bus-tracker/viewer.html 。若仍看到舊版，重新整理或清除網站快取。
4. 此版本不需 npm、建置、後端伺服器或代理。請透過 HTTPS 網站使用，不要直接雙擊 HTML。

## Google Maps 設定

已將提供的 Google Maps key 寫入 `maps-config.js`；底線是實際 `_`，沒有 Markdown 的反斜線。原本 Firebase 的 key 和 config 完整保留在 `config.js`。

在該 Google Cloud 專案啟用帳單及以下兩個 API：

- **Maps JavaScript API**
- **Routes API**

Google Cloud → APIs & Services → Credentials → 選取這把 Maps key：

- 應用程式限制：**Websites / HTTP referrers**。
- 網站來源加入：`https://willywen312.github.io/bus-tracker/*`。
- API 限制：**Restrict key**，只勾選 **Maps JavaScript API + Routes API**。
- 儲存後等待設定生效。瀏覽器 key 會公開出現在網頁中，使用上述限制保護。

本專案透過 Maps JavaScript 的 `routes` library 呼叫 `Route.computeRoutes`，可在靜態網頁使用網站來源限制的 key，不直接從瀏覽器呼叫 Routes REST endpoint。地圖標記使用 Advanced Markers 和官方 `DEMO_MAP_ID`；可依需求替換為自己的 Map ID。

若瀏覽器或隱私工具移除 Referer，可能無法匹配含路徑的來源限制；使用一般瀏覽器設定測試，勿設定 `no-referrer`。本機 localhost 與其他預覽網域不在上述允許範圍，因此不能以本機預覽判斷正式網站金鑰是否可用。

## 使用方式

1. 隨車手機開啟 `sender.html`，允許定位，按「開始 GPS 追蹤並上傳」。保持 Safari／瀏覽器在前景且螢幕亮起；鎖屏或切換 App 可能停止定位。
2. 家長手機開啟 `viewer.html`。
3. 輸入接送點緯度、經度後儲存，或按「用這支手機目前位置」。手機定位只取得一次，作為固定目的地；不會持續追蹤家長。
4. 地圖上「車」代表娃娃車、「家」代表目的地；藍線為 Google 建議道路路線。可按「查看完整路線」重新縮放。
5. 顯示道路距離、行車 ETA、GPS 速度、定位精度與最後 GPS 更新秒數。ETA 原始值 **≤300 秒**時出現醒目提醒；分鐘顯示向上取整，最少顯示約 1 分鐘。

目的地沿用原本 `bus-destination` 本機儲存欄位。目的地不寫入 Firebase，但計算路線時會將車輛及目的地座標傳送給 Google Maps。

## 計算與異常處理

- `DRIVING` + `TRAFFIC_AWARE`，依可用交通狀況估算；若 Google 回報降級結果，畫面會明確提示。ETA 不包含沿途接送停靠時間，也不代表司機必定沿此路線行駛。
- 每次有效 GPS 更新立即移動車輛標記。路線請求至少間隔 30 秒，合併期間更新並使用最新座標，同一時間只有一個等待中的路線請求。
- 修改目的地、GPS 恢復、重新連線也遵守 30 秒限制。尚未回傳的舊目的地結果會被忽略。
- GPS 資料超過 60 秒、Firebase 斷線、座標失效或頁面進入背景時，暫停路線計算與抵達提醒；舊標記可供辨識最後位置。恢復前景與有效連線後重新排程。
- 每秒更新 GPS 資料年齡，沿用 Firebase 伺服器時間差校正。路線估算超過 60 秒也會失效。
- Routes 失敗或找不到可行駛路線時，移除原本路線／ETA，30 秒後重試；不使用直線距離冒充道路距離。
- 地圖載入失敗不影響 Firebase GPS 接收；畫面有錯誤說明及 Google 地圖位置連結。
- 每位開啟家長頁面的使用者分別發出路線請求，持續更新時最多約每分鐘 2 次。可在 Google Cloud 查看用量、設定配額及預算通知。
- 預設 `maps-config.js` 的 `routeIntervalMs` 為 30000、`staleAfterMs` 為 60000。程式限制最短間隔 30000；大幅調長間隔時也要考慮估算有效期限。

## 保留的 Firebase 行為

`sender.html`、`config.js`、共用 `style.css` 與原始版本逐位元一致。Firebase SDK 沿用 12.2.1；家長端仍讀取：

```text
vehicles/demo-bus-001/latest
```

實際車輛 ID 由 `config.js` 的 `vehicleId` 決定。資料欄位維持 `latitude`、`longitude`、`speedKmh`、`accuracy`、`gpsTimestamp`、`updatedAt`，並監聽 `.info/connected`、`.info/serverTimeOffset`。V2 未修改 Firebase Rules，也未新增認證機制。正式使用時應依既有權限設定管理誰能讀寫車輛位置。

## 驗證與部署後檢查

交付前以 Node 執行實際家長端程式，模擬 DOM、時間、Firebase 與 Google Maps，驗證：座標標記狀態、道路距離／ETA、5 分鐘界線、更新節流、切換目的地的過時回應、斷線與過期資料、清除目的地、定位成功／權限遭拒、無效座標、Routes 失敗及恢復、背景／前景切換、地圖失敗時 GPS 仍可接收。已通過 JavaScript 語法檢查，以及原始 Firebase 設定／發射端／共用樣式逐位元比對。模擬測試不呼叫你的計費 API，也不寫入 Firebase。

此環境啟動瀏覽器遭系統限制，因此尚未完成真實瀏覽器與手機畫面驗證。手機版已加入響應式地圖高度、雙欄資訊與滿寬按鈕；請部署後在 iPhone Safari 檢查排版、定位授權及真實地圖繪製。

尚未在正式網域驗證你的 Cloud API 啟用、帳單、配額與 referrer 設定。部署後請用兩支手機確認：發射端有新 GPS → 家長端標記更新 → 設定目的地後顯示真實道路藍線及 ETA → 停止發射超過 60 秒後提醒消失。建議先在安全的固定位置完成測試。

## 檔案

- `index.html`：入口。
- `sender.html`：原本 GPS 發射端。
- `viewer.html`、`viewer.js`、`viewer-v2.css`：V2 家長端。
- `config.js`：原本 Firebase 設定。
- `maps-config.js`：Maps key 與計算間隔。
- `style.css`：原本共用樣式。

## 官方參考

- [取得路線與瀏覽器範例](https://developers.google.com/maps/documentation/javascript/routes/get-a-route)
- [Routes JavaScript 參考：durationMillis、routingPreference](https://developers.google.com/maps/documentation/javascript/reference/route)
- [Google Maps API key 安全最佳實務](https://developers.google.com/maps/api-security-best-practices)
