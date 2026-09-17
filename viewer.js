import {createTrips} from './trips.js';
import {statistics,routeKey,quality} from './learning.js';
let learning=null, learningError='';
const $ = id => document.getElementById(id);
const cfg = window.BUS_TRACKER_CONFIG;
const mapsCfg = window.BUS_MAPS_CONFIG;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const valid = (lat, lng) => finite(lat) && finite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const interval = Math.max(30000, mapsCfg.routeIntervalMs || 30000);
const staleAfter = mapsCfg.staleAfterMs || 60000;
let data = null, destination = null, connected = false, offset = 0, firebaseError = '';
let map, busMarker, destMarker, Route, polylines = [], mapFailed = false;
let generation = 0, busy = false, dirty = false, timer = null, lastRequest = -Infinity;
let estimate = null, routeMessage = '', fitted = false, locateVersion = 0;

try {
  const saved = JSON.parse(localStorage.getItem('bus-destination'));
  if (saved && valid(saved.lat, saved.lng)) destination = {lat: saved.lat, lng: saved.lng};
} catch {}
function showDestination() {
  $('lat').value = destination?.lat ?? '';
  $('lng').value = destination?.lng ?? '';
}
function fresh() {
  return !!data && Date.now() + offset - data.gpsTimestamp <= staleAfter &&
    data.gpsTimestamp <= Date.now() + offset + 10000;
}
function usable() { return connected && fresh() && !!destination && !document.hidden; }
function clearRoute() {
  estimate = null;
  polylines.forEach(p => p.setMap(null));
  polylines = [];
}
function invalidate() {
  generation++;
  clearRoute();
  clearTimeout(timer); timer = null;
  dirty = true;
}
function updateMarkers() {
  if (!map || mapFailed) return;
  busMarker.map = data ? map : null;
  if (data) busMarker.position = {lat: data.latitude, lng: data.longitude};
  destMarker.map = destination ? map : null;
  if (destination) destMarker.position = destination;
  if (!fitted && data) { fit(); fitted = true; }
}
function fit() {
  if (!map || mapFailed) return;
  const bounds = new google.maps.LatLngBounds();
  if (data) bounds.extend({lat: data.latitude, lng: data.longitude});
  if (destination) bounds.extend(destination);
  polylines.forEach(p => p.getPath().forEach(point => bounds.extend(point)));
  if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
}
$('fit').onclick = fit;
async function save(lat, lng) {
  try { if(!learning) throw Error("Firebase 尚未就緒"); await learning.settings({lat,lng}, $("routeName").value); learningError=""; } catch(e) { $("destStatus").textContent=e.message; return; }
  locateVersion++;
  destination = {lat, lng};
  invalidate(); fitted = false; windowRouteDrawn = false; showDestination(); updateMarkers();
  try {
    localStorage.setItem('bus-destination', JSON.stringify(destination));
    $('destStatus').textContent = '目的地已儲存在這支手機。';
  } catch { $('destStatus').textContent = '目的地已設定，但此瀏覽器無法永久儲存。'; }
  routeMessage = ''; render(); schedule();
}
$('destination').onsubmit = e => {
  e.preventDefault();
  const a = $('lat').value.trim(), b = $('lng').value.trim();
  if (!a || !b || !valid(Number(a), Number(b))) {
    $('destStatus').textContent = '請輸入有效緯度（-90～90）與經度（-180～180）。'; return;
  }
  save(Number(a), Number(b));
};
$('clear').onclick = () => {
  if(learning?.state.id){$('destStatus').textContent='行程中無法清除目的地。';return;}
  locateVersion++; destination = null; invalidate(); showDestination(); updateMarkers();
  try { localStorage.removeItem('bus-destination'); } catch {}
  $('destStatus').textContent = '已清除目的地。'; render();
};
$('locate').onclick = () => {
  if (!window.isSecureContext || !navigator.geolocation) {
    $('destStatus').textContent = '請透過 HTTPS 開啟並允許定位。'; return;
  }
  const version = ++locateVersion;
  $('locate').disabled = true; $('destStatus').textContent = '正在取得目前位置…';
  navigator.geolocation.getCurrentPosition(p => {
    $('locate').disabled = false;
    if (version === locateVersion) save(p.coords.latitude, p.coords.longitude);
  }, e => {
    $('locate').disabled = false;
    if (version !== locateVersion) return;
    $('destStatus').textContent = ({1:'定位權限遭拒，請允許網站使用位置。',2:'目前無法取得位置，請移至戶外再試。',3:'定位逾時，請確認定位服務與網路。'})[e.code] || '定位失敗，請再試一次。';
  }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
};

function schedule() {
  if (!dirty || busy || timer || !Route || mapFailed || !usable()) return;
  timer = setTimeout(() => { timer = null; void compute(); }, Math.max(0, lastRequest + interval - Date.now()));
}
async function compute() {
  if (busy || !usable() || !Route || mapFailed) return;
  busy = true; dirty = false; lastRequest = Date.now();
  const version = generation;
  const origin = {lat: data.latitude, lng: data.longitude};
  const originTimestamp = data.gpsTimestamp;
  const captured={...data}, tripId=learning?.state.id, requestedAt=learning?.now() || Date.now();
  routeMessage = '正在更新道路路線與路況…'; render();
  try {
    const result = await Route.computeRoutes({
      origin, destination: {...destination}, travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
      fields: ['path', 'distanceMeters', 'durationMillis'], language: 'zh-TW'
    });
    if (version !== generation || !usable() || mapFailed) return;
    if (Date.now() + offset - originTimestamp > staleAfter) { dirty = true; return; }
    const route = result.routes?.[0];
    if (!route || !finite(route.durationMillis) || route.durationMillis < 0 ||
        !finite(route.distanceMeters) || route.distanceMeters < 0 || !route.path?.length) {
      throw new Error('找不到可行駛路線，請確認目的地是否靠近道路。');
    }
    clearRoute();
    polylines = route.createPolylines({polylineOptions: {strokeColor: '#1565c0', strokeWeight: 6}});
    polylines.forEach(p => p.setMap(map));
    estimate = {duration: route.durationMillis, distance: route.distanceMeters, at: Date.now(), fallback: !!result.fallbackInfo};
    routeMessage = '';
    if(learning && tripId && tripId===learning.state.id && learning.state.trip?.status==='active') {
      const reasons=quality({accuracy:captured.accuracy,timestamp:captured.gpsTimestamp,gapMs:captured.gapMs},learning.now());
      if(result.fallbackInfo) reasons.push('google-fallback');
      if(captured.tripId!==tripId) reasons.push('different-trip');
      void learning.sample(tripId,{timestamp:requestedAt,recordedAt:learning.now(),gpsTimestamp:originTimestamp,lat:origin.lat,lng:origin.lng,accuracy:captured.accuracy??null,gapMs:captured.gapMs??null,googleEtaSeconds:route.durationMillis/1000,distanceMeters:route.distanceMeters,valid:reasons.length===0,reasons:reasons.join(',')}).catch(e=>{learningError='ETA 寫入失敗：'+e.message;renderLearning();});
    }
    if (!fitted || !windowRouteDrawn) { fit(); fitted = true; windowRouteDrawn = true; }
  } catch (e) {
    if (version === generation) {
      clearRoute(); dirty = true;
      routeMessage = '路線計算失敗，將於 30 秒後重試。請檢查網路、API 啟用／金鑰限制與配額。' + (e.message || '');
    }
  } finally { busy = false; render(); schedule(); }
}
let windowRouteDrawn = false;
function render() {
  $('connection').textContent = connected ? 'Firebase 已連線' : 'Firebase 未連線；等待恢復';
  $('status').textContent = firebaseError || (!data ? '尚無有效位置，請先啟動發射端。' :
    !fresh() ? '位置已過期或時間異常，請聯絡隨車人員確認。' : connected ? '正在接收車輛位置' : '連線中斷，顯示最後收到的位置。');
  $('coords').textContent = data ? data.latitude.toFixed(6) + ', ' + data.longitude.toFixed(6) : '—';
  $('speed').textContent = data && finite(data.speedKmh) && data.speedKmh >= 0 ? data.speedKmh.toFixed(1) + ' km/h' : '—';
  $('accuracy').textContent = data && finite(data.accuracy) ? '± ' + Math.round(data.accuracy) + ' 公尺' : '—';
  $('updated').textContent = data ? Math.max(0, Math.floor((Date.now() + offset - data.gpsTimestamp) / 1000)) + ' 秒前' : '—';
  $('map').hidden = !data;
  if (data) $('map').href = 'https://www.google.com/maps?q=' + data.latitude + ',' + data.longitude;
  const current = usable() && estimate && Date.now() - estimate.at <= staleAfter && !mapFailed;
  $('distance').textContent = current ? (estimate.distance < 1000 ? Math.round(estimate.distance) + ' 公尺' : (estimate.distance / 1000).toFixed(2) + ' 公里') : '—';
  $('eta').textContent = current ? '約 ' + Math.max(1, Math.ceil(estimate.duration / 60000)) + ' 分鐘' : '—';
  $('arrival').hidden = !(current && estimate.duration <= 300000);
  renderLearning(current);
  $('etaNote').textContent = !destination ? '請先設定接送目的地。' : !data ? '等待車輛位置。' :
    !fresh() || !connected ? '等待連線與新 GPS 位置；暫停 ETA 與抵達提醒。' : mapFailed ? '地圖服務無法使用，GPS 接收仍持續運作。' :
    routeMessage || (current ? (estimate.fallback ? 'Google 已降級估算，可能未完整納入路況。' : '依 Google 道路路線與可用路況估算。') +
      '路線更新於 ' + Math.floor((Date.now() - estimate.at) / 1000) + ' 秒前；不含沿途接送停靠時間。' : '等待道路路線計算…');
}

function mapsFailure() {
  mapFailed = true; invalidate();
  $('mapStatus').textContent = 'Google 地圖載入失敗。請檢查網路、帳單、Maps JavaScript API／Routes API 與網站來源限制，再重新整理。';
  render();
}
window.gm_authFailure = mapsFailure;
async function initMap() {
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('地圖載入逾時')), 20000);
      window.busMapsReady = () => { clearTimeout(timeout); resolve(); };
      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({key: mapsCfg.apiKey, loading: 'async', callback: 'busMapsReady', v: 'weekly', language: 'zh-TW', region: 'TW'});
      script.onerror = () => { clearTimeout(timeout); reject(new Error('地圖載入失敗')); };
      document.head.append(script);
    });
    const [{Map}, {AdvancedMarkerElement}, routes] = await Promise.all([
      google.maps.importLibrary('maps'), google.maps.importLibrary('marker'), google.maps.importLibrary('routes')
    ]);
    if (mapFailed) return;
    Route = routes.Route;
    map = new Map($('mapCanvas'), {center: {lat: 25.033, lng: 121.5654}, zoom: 13, maxZoom: 18, mapId: 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false});
    const label = text => { const el = document.createElement('span'); el.textContent = text; el.style.cssText = 'background:#fff;border:2px solid #1565c0;border-radius:20px;padding:6px 12px;font-weight:700;color:#123'; return el; };
    busMarker = new AdvancedMarkerElement({title: '娃娃車', content: label('車')});
    destMarker = new AdvancedMarkerElement({title: '接送目的地', content: label('家')});
    $('mapStatus').textContent = 'Google 地圖已就緒'; updateMarkers(); dirty = true; schedule();
  } catch { mapsFailure(); }
}
async function initFirebase() {
  try {
    const [app, database] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js')
    ]);
    const db = database.getDatabase(app.initializeApp(cfg.firebaseConfig));
    const {ref, onValue} = database;
    learning=createTrips(db,database,cfg.vehicleId,s=>{
      const chosen=s.trip?.status==='active'?{destination:s.trip.destination,route:s.trip.route}:s.settings;
      if(chosen){
        $('routeName').value=chosen.route;
        if(JSON.stringify(destination)!==JSON.stringify(chosen.destination)){destination=chosen.destination;invalidate();showDestination();updateMarkers();schedule();}
      }
      for(const id of ['lat','lng','routeName','locate','clear']) $(id).disabled=!!s.id;
      renderLearning();
    },e=>{learningError='V3 資料讀寫失敗：'+e.message+'；請查看 README 的測試版 Rules。';renderLearning();});
    onValue(ref(db, '.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; });
    onValue(ref(db, '.info/connected'), s => {
      connected = s.val() === true;
      if (!connected) invalidate();
      else dirty = true;
      render(); schedule();
    });
    onValue(ref(db, 'vehicles/' + cfg.vehicleId + '/latest'), s => {
      const v = s.val();
      data = v && valid(v.latitude, v.longitude) && finite(v.updatedAt) && finite(v.gpsTimestamp) ? v : null;
      firebaseError = '';
      if (!data || !fresh()) invalidate();
      dirty = true; updateMarkers(); render(); schedule();
    }, e => {
      firebaseError = '讀取失敗：' + e.message + '；請檢查 Firebase Rules。';
      data = null; invalidate(); updateMarkers(); render();
    });
  } catch (e) { firebaseError = 'Firebase 載入失敗，請檢查網路後重新整理：' + e.message; render(); }
}
showDestination(); render();
void initMap(); void initFirebase();
setInterval(() => {
  if ((!fresh() || !connected) && estimate) invalidate();
  if (estimate && Date.now() - estimate.at > staleAfter) { clearRoute(); dirty = true; }
  render(); schedule();
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) invalidate();
  else { dirty = true; schedule(); }
  render();
});

function renderLearning(current=usable() && estimate && Date.now()-estimate.at<=staleAfter && !mapFailed){
 if(!learning)return;
 const s=learning.state, active=s.trip?.status==='active', key=destination?routeKey(cfg.vehicleId,$('routeName').value,destination):'';
 const result=statistics(s.history,key,current?estimate.duration/1000:null);
 $('tripCount').textContent=result.count+' 次';
 $('meanError').textContent=result.mean===null?'學習中':(result.mean>=0?'+':'')+(result.mean/60).toFixed(1)+' 分鐘';
 $('rawEta').textContent=current?'約 '+Math.ceil(estimate.duration/60000)+' 分鐘':'—';
 $('correctedEta').textContent=!current?'等待本次 ETA':result.corrected===null?'學習中（未套用）':'約 '+Math.ceil(result.corrected/60)+' 分鐘';
 $('learnStatus').textContent=learningError || (result.residual===null?'學習中：同一路線及目前 ETA 區間各需 5 次有效行程。':'已套用歷史中位數誤差 '+(result.residual/60).toFixed(1)+' 分鐘。')+' 此區間：'+result.bucketCount+' 次。';
 $('activeStatus').textContent=active?'行程進行中：'+s.trip.route: s.id?'行程已結束；發射端可開始下一次。':'尚未開始行程';
 $('arrived').disabled=!active || !s.connected;
 if(current && result.corrected!==null) $('arrival').hidden=result.corrected>300;
}
$('arrived').onclick=async()=>{
 if(!confirm('確認娃娃車現在已實際抵達接送目的地？'))return;
 $('arrived').disabled=true;
 try{await learning.finish(true);learningError='';}catch(e){learningError='抵達記錄失敗：'+e.message;}
 renderLearning();
};
