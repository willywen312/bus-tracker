import {createTrips} from './trips.js';
import {quality} from './learning.js';
const $=id=>document.getElementById(id), cfg=window.BUS_TRACKER_CONFIG;
let watch=null, running=false, busy=false, last=0, previous=null, tripId=null, service;
function pause(){running=false;if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;$('start').disabled=false;}
try {
 const [app,api]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js')]);
 const db=api.getDatabase(app.initializeApp(cfg.firebaseConfig));
 const latest=api.ref(db,'vehicles/'+cfg.vehicleId+'/latest');
 service=createTrips(db,api,cfg.vehicleId,s=>{
  $('connection').textContent=s.connected?'Firebase 已連線':'Firebase 未連線；請保持前景並等待恢復';
  $('tripStatus').textContent=s.trip?.status==='active'?'行程進行中：'+s.trip.route:s.settings?'待出發路線：'+s.settings.route:'請先在家長端儲存目的地與路線';
  $('stop').disabled=!s.connected || !s.id;
  if(running && (s.id!==tripId || (s.trip && s.trip.status!=='active'))){pause();$('status').textContent='行程已由其他裝置結束，已停止定位。';}
 },e=>{$('status').textContent='V3 讀取失敗：'+e.message+'；請查看 README 的 Rules。';});
 $('start').disabled=false;
 $('start').onclick=async()=>{
  $('start').disabled=true;
  try{
   if(!navigator.geolocation || !window.isSecureContext)throw Error('請以 HTTPS 開啟並允許定位。');
   tripId=await service.start();
   const old=(await api.get(latest)).val(); previous=old?.tripId===tripId?old.gpsTimestamp:service.now();last=0;running=true;
   $('status').textContent='行程已開始，等待 GPS…';
   watch=navigator.geolocation.watchPosition(async pos=>{
    if(!running || busy || !service.state.connected || Date.now()-last<10000)return;
    busy=true;last=Date.now();const id=tripId,c=pos.coords;
    const p={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,speed:Number.isFinite(c.speed)&&c.speed>=0?c.speed:null,timestamp:pos.timestamp,gapMs:Math.max(0,pos.timestamp-previous),receivedAt:service.now()};
    p.reasons=quality(p,service.now()).join(',');p.valid=!p.reasons;
    try{
     const r=await service.point(id,p);
     if(!r.committed){pause();return;}
     previous=p.timestamp;
     await api.set(latest,{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy,speedKmh:p.speed===null?null:p.speed*3.6,gpsTimestamp:p.timestamp,updatedAt:api.serverTimestamp(),gapMs:p.gapMs,tripId:id});
     $('coords').textContent=p.lat.toFixed(6)+', '+p.lng.toFixed(6);
     $('accuracy').textContent='± '+Math.round(p.accuracy)+' 公尺';$('speed').textContent=p.speed===null?'—':(p.speed*3.6).toFixed(1)+' km/h';
     $('uploaded').textContent=new Date().toLocaleTimeString('zh-TW');
     $('status').textContent=running?(p.valid?'GPS 與行程記錄已上傳。':'位置已保存，但品質不佳，不供學習：'+p.reasons):'行程已結束。';
    }catch(e){$('status').textContent='上傳失敗：'+e.message+'；請檢查 Rules，恢復後接續定位。';}finally{busy=false;}
   },e=>{if(e.code===1)pause();$('status').textContent='GPS 失敗：'+e.message+'；行程仍保留，可接續定位或結束。';},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }catch(e){pause();$('status').textContent=e.message;}
 };
 $('stop').onclick=async()=>{
  if(!confirm('結束本次行程？若已到接送點，請改在家長端按「已抵達」才能參與學習。'))return;
  $('stop').disabled=true;
  try{await service.finish(false);pause();$('status').textContent='行程已結束（未確認抵達，不參與學習）。';}catch(e){$('stop').disabled=false;$('status').textContent='結束失敗：'+e.message;}
 };
 window.addEventListener('pagehide',pause);
} catch(e){$('status').textContent='載入失敗：'+e.message;}
