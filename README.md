# Bus Tracker V3「ETA 學習版」

沿用已運作的 V2：手機瀏覽器 sender.html → 原 Firebase Realtime Database → viewer.html + Google Maps / Routes。原 config.js、maps-config.js 完全保留，無須重建 Firebase、Google Cloud 或 GitHub Pages。

## 覆蓋部署

1. 先備份目前 GitHub repository 檔案與 Firebase Rules。
2. 解壓 bus-tracker-v3.zip，將**裡面全部檔案**上傳原 bus-tracker repository 根目錄，覆蓋同名檔案；不要上傳 ZIP 或額外包一層資料夾。
3. Commit changes，等待 GitHub Pages 部署完成。
4. 開啟 https://willywen312.github.io/bus-tracker/ ，關閉舊分頁再開啟，確認標題 V3。兩端都必須使用 V3。
5. 若顯示 PERMISSION_DENIED，依下節擴充原 Realtime Database Rules。程式不能從公開網站讀取你目前的 Rules，因此本包未修改線上規則或線上資料。

## Firebase Rules：完整測試版

此檔為**測試版，不含身分驗證**。任何知道資料庫位置的人都能讀取 trips（含 GPS、目的地），並修改 demo-bus-001 與它的行程。僅適用目前受控實測；尚未具備正式家長／老師權限隔離。沒有記錄兒童姓名或地址文字，GPS 與目的地座標仍是位置資料。

到既有 Firebase 專案 → Realtime Database → 規則（Rules）。若原規則只允許 vehicles，V3 需要額外開放 trips，並允許 vehicles/demo-bus-001/activeTripId 與 learningSettings。若目前根層已允許讀寫，可直接運作，但建議加入 trips 的 vehicleId 索引。

以下為可整份貼上的完整測試規則，也另存於 firebase-rules-test.json。請先備份原規則；此完整版本會封閉未列出的其他路徑。若同一資料庫還有別的應用，請合併 vehicles、trips 部分，保留其他應用規則。V3 交易需要同一路徑的讀取與寫入權限。

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "vehicles": {
      "demo-bus-001": {
        ".read": true,
        ".write": true
      }
    },
    "trips": {
      ".read": true,
      ".indexOn": ["vehicleId"],
      "$tripId": {
        ".write": "(!data.exists() && newData.child('vehicleId').val() === 'demo-bus-001') || data.child('vehicleId').val() === 'demo-bus-001'",
        ".validate": "newData.hasChildren(['version', 'vehicleId', 'status', 'startTime', 'destination', 'route', 'routeKey']) && newData.child('vehicleId').val() === 'demo-bus-001' && newData.child('version').val() === 3",
        "status": {".validate": "newData.val() === 'active' || newData.val() === 'arrived' || newData.val() === 'ended' || newData.val() === 'abandoned'"},
        "startTime": {".validate": "newData.isNumber()"},
        "endTime": {".validate": "newData.isNumber()"},
        "actualArrivalTime": {".validate": "newData.isNumber() && newData.val() >= newData.parent().child('startTime').val()"},
        "destination": {
          ".validate": "newData.hasChildren(['lat', 'lng'])",
          "lat": {".validate": "newData.isNumber() && newData.val() >= -90 && newData.val() <= 90"},
          "lng": {".validate": "newData.isNumber() && newData.val() >= -180 && newData.val() <= 180"}
        }
      }
    }
  }
}

```

## 第一次操作與實測

1. 家長端輸入固定接送目的地座標、學習路線名稱（例如「上午上學」或「下午回家」），按「儲存目的地」。也可使用手機目前位置取得座標。目的地與路線會同步到發射端。
2. 隨車手機開 sender.html，按「開始行程／接續定位」，允許 GPS。確認顯示「GPS 與行程記錄已上傳」。只使用一支發射手機。
3. 家長端保持開啟及前景，確認車輛位置、道路路線與 Google ETA 更新。道路計算沿用 V2，最多約每 30 秒一次；有效 GPS 更新才會觸發後續計算。
4. **車輛實際到達接送點時**，家長按「已抵達」，確認後寫入 actualArrivalTime、endTime，標記 arrived，停止該行程。不是家長走到接送點時按。
5. 隨車端「結束行程」只標記 ended，不會猜測抵達時間，也不參與學習。若誤用這個按鈕，請將該次視為未完成實驗，下一次重新開始。
6. 同一路線累積 5–10 次，保留相同路線名稱與固定目的地座標。上午／下午、路線順序明顯不同時用不同名稱。至少 5 次有效行程，且目前 ETA 桶也至少涵蓋 5 次行程，才顯示校正值。

目前每台車同時只有一個學習目的地／一個 active trip，適合這次單一家長實測；不是多家庭各自抵達的系統。行程中目的地固定。其他家長端開啟時會同步該次的目的地。

### 建議驗收

- 首次顯示「0 次／學習中」，本次 Google ETA 有值時，校正欄仍顯示「學習中（未套用）」。
- 開始行程後，Firebase trips 出現一筆；行駛時 points 增加，家長端開啟時 etaSamples 增加。
- 已抵達後，status=arrived、actualArrivalTime/endTime 有值；activeTripId 消失。重複抵達不應改寫首次抵達時間。
- 在發射端結束另一次行程：status=ended，沒有 actualArrivalTime，不計入有效次數。
- 關閉發射頁面後重新開啟，按接續定位沿用原 trip，不會自行將關頁時間當抵達時間。
- 定位中斷超過 120 秒後恢復，新的 GPS points 會包含 gps-gap；受影響 ETA 不參與學習。
- 第 5 次後，如果目前 ETA 區間仍沒有 5 次有效行程，繼續顯示學習中是正常的。
- Firebase 權限不足、GPS 拒絕授權、網路中斷均應有文字提示，不應假裝寫入成功。

## 資料結構與單位

```text
vehicles/demo-bus-001/
  latest                 # 保留 V2 latitude/longitude/speedKmh/accuracy/gpsTimestamp/updatedAt
                         # 新增 tripId、gapMs
  activeTripId           # 目前 trip id；結束後刪除
  learningSettings/
    destination/{lat,lng}
    route               # 路線代號，不填人名或地址
trips/{tripId}/
  version: 3
  vehicleId
  status                # active / arrived / ended / abandoned
  route, routeKey
  startTime, endTime     # Firebase 伺服器時間，毫秒
  actualArrivalTime     # 僅家長確認已抵達時寫入
  destination/{lat,lng} # 行程開始時固定
  points/{timestampKey}/
    lat, lng, accuracy  # accuracy 公尺
    speed               # 公尺/秒，未知以 null 寫入（RTDB 會省略 null 欄位）
    timestamp           # GPS 原始 epoch 毫秒
    receivedAt, gapMs, valid, reasons
  etaSamples/{30secondSlot}/
    timestamp           # Google 請求開始時間，使用 Firebase serverTimeOffset 校時
    recordedAt          # Google 回應取得時間
    gpsTimestamp, lat, lng, accuracy, gapMs
    googleEtaSeconds    # 原始 Google 道路 ETA，秒
    distanceMeters      # 道路距離，公尺
    valid, reasons      # 不合格樣本仍保留原因
```

GPS 每次新定位且距上次嘗試至少 10 秒才寫入；瀏覽器沒有新定位時不會製造假樣本。沒有保存 Google 道路圖形。每個行程的每 30 秒時間格只收第一筆 Google 成功回應，避免多個 viewer 重複加權。API 失敗沒有數值，會顯示錯誤並重試，不寫入虛構 ETA。無法取得速度時不以 0 偽裝。

開始、樣本寫入與結束使用 Firebase 交易保護。每次修改行程會再次確認 status=active；結束後遲到的寫入拒收，競爭抵達只接受首次成功的時間。GPS 與 latest 分兩步寫入，避免為了相容 V2 而要求資料庫根目錄權限。若歷史寫入成功但 latest 失敗，畫面會顯示上傳錯誤。競爭開始失敗的多餘紀錄標記 abandoned，不參與學習。

## 可解釋的校正

分組 key = 車輛 + 路線名稱 + 目的地（座標到小數 5 位）。重新設定 GPS 取得的目的地可能略有偏差，因此實測時保留同一組目的地設定，不要每天重新定位目的地。

每筆有效 ETA：

`residual 秒 = (actualArrivalTime − sample.timestamp) / 1000 − googleEtaSeconds`

正值代表 Google 低估，負值代表 Google 高估。區間為 [0,5)、[5,10)、[10,15)、[15,20)、[20,∞) 分鐘；恰好 5 分鐘屬於 5–10 桶。

1. 先算**每次行程、每個桶**的 residual 中位數。
2. 再算同一桶跨行程中位數，使每趟權重相同，避免慢速或開較多 viewer 的行程佔優勢。
3. 有效行程總數 ≥5 且該桶包含 ≥5 次不同有效行程，才套用 `max(0, Google ETA + 桶中位數 residual)`。
4. 歷史平均 ETA 誤差先算每趟有效樣本的平均，再取跨行程平均；不足 5 次不顯示。它與用來校正的桶中位數是不同指標。數值是帶正負的平均誤差，不是平均絕對誤差。
5. 5 分鐘提示有校正值時使用校正 ETA，否則沿用 Google ETA；只是畫面提示。

無其他桶備援、不套固定加分鐘、不以單趟很多樣本冒充 5 趟。不足時明確顯示學習中。這是歷史統計估計，不是保證抵達時間。

## 品質排除與中斷

- accuracy >100m、未知／負精度、GPS age >60 秒、GPS 超前伺服器校時 >10 秒、前後 gap >120 秒均標記不合格。
- Google fallback、GPS 的 tripId 不屬於本次行程，也不供學習。
- ETA 時間不在開始與實際抵達之間者排除。
- 從 ETA 樣本到抵達之間若出現 >120 秒 GPS gap，保守排除該筆 ETA；恢復後合格樣本仍可參與。
- 抵達前最後一筆 GPS 距抵達 >120 秒，整趟不列入有效行程。至少一筆合格 ETA 才算有效行程。
- 只以 arrived 且 actualArrivalTime 正確的行程學習；ended、abandoned、不完整行程不算。

保持手機時間自動設定。iPhone Safari 切 App、鎖屏或接電話仍可能暫停定位，V3 沒有變成原生背景 GPS App。保持發射端前景與螢幕亮起，家長端也需前景才能持續呼叫 Routes。關閉頁面不會自動寫入抵達；重開後可接續或明確結束。

中斷網路時不接受新的開始／結束／ETA 操作。已送出的 Firebase 寫入可能等待網路恢復；因此未看到成功訊息前，不應視為已完成。若離線後才補按抵達，時間會不準，建議將該次以發射端結束而不參與學習。

## 實作與驗證範圍

保留原 Maps/Routes API 與 Firebase SDK 版本，無建置步驟。共用 trips.js 處理資料生命週期，learning.js 為純統計運算；viewer.js 繼承 V2 道路與地圖流程。

已執行 JavaScript 語法檢查、17 項統計檢查、行程生命週期測試，以及使用模擬 Firebase/Google 的 sender/viewer UI 事件整合測試。檢查包含少於 5 趟、分桶邊界、不同路線、GPS gap、過期、樣本去重、重複開始、抵達與結束後拒收資料。

未向你的正式 Firebase 寫測試資料，未修改線上 Rules 或部署 GitHub。這個環境未能啟動瀏覽器，因此未完成實際瀏覽器視覺檢查；Google 真實地圖、API 權限與手機 GPS／網路請按上面的實測流程驗收。Rules 已檢查 JSON 語法，未在 Firebase Emulator 上執行。

此初版依車輛讀取全部 trips，包括歷史 points，並對單趟用交易更新；適合 5–10 趟實驗，長期大量資料應再做摘要、分頁、存取控制與保留期限。可在 Firebase 匯出備份後刪除不需要的測試 trips；不要刪除進行中的行程。

參考：[Firebase 讀寫與交易](https://firebase.google.com/docs/database/web/read-and-write)、[Google Routes JavaScript](https://developers.google.com/maps/documentation/javascript/routes/get-a-route)。
