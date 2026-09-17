export const finite = n => typeof n === 'number' && Number.isFinite(n);
export const bucket = seconds => Math.min(4, Math.floor(seconds / 300));
export const median = a => { const b = [...a].sort((x,y)=>x-y); return b.length ? (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2 : null; };
export const routeKey = (vehicle, route, d) => [vehicle, route.trim(), d.lat.toFixed(5), d.lng.toFixed(5)].join('|');
export function quality(p, now) {
 const reasons=[];
 if (!finite(p.accuracy) || p.accuracy > 100 || p.accuracy < 0) reasons.push('accuracy');
 if (!finite(p.timestamp) || now-p.timestamp>60000 || p.timestamp>now+10000) reasons.push('stale-or-clock');
 if (p.gapMs>120000) reasons.push('gps-gap');
 return reasons;
}
export function statistics(trips, key, seconds) {
 const groups=Array.from({length:5},()=>[]), means=[];
 for(const t of Object.values(trips||{})) {
  if(!t || t.routeKey!==key || t.status!=='arrived' || !finite(t.startTime) || !finite(t.actualArrivalTime) || t.actualArrivalTime<t.startTime) continue;
  const per=Array.from({length:5},()=>[]), residuals=[];
  const points=Object.values(t.points||{});
  const lastPoint=Math.max(0,...points.filter(p=>finite(p.timestamp) && p.timestamp<=t.actualArrivalTime).map(p=>p.timestamp));
  if(!lastPoint || t.actualArrivalTime-lastPoint>120000) continue;
  for(const s of Object.values(t.etaSamples||{})) {
   if(s.valid!==true || !finite(s.googleEtaSeconds) || s.googleEtaSeconds<0 || !finite(s.timestamp) || s.timestamp<t.startTime || s.timestamp>t.actualArrivalTime) continue;
   if(points.some(p=>p.gapMs>120000 && p.timestamp>s.timestamp && p.timestamp<=t.actualArrivalTime)) continue;
   const r=(t.actualArrivalTime-s.timestamp)/1000-s.googleEtaSeconds;
   per[bucket(s.googleEtaSeconds)].push(r); residuals.push(r);
  }
  if(residuals.length) means.push(residuals.reduce((a,b)=>a+b,0)/residuals.length);
  per.forEach((a,i)=>{if(a.length) groups[i].push(median(a));});
 }
 const b=finite(seconds)?bucket(seconds):null, values=b===null?[]:groups[b];
 const residual=means.length>=5 && values.length>=5?median(values):null;
 return {count:means.length, bucketCount:values.length, mean:means.length>=5?means.reduce((a,b)=>a+b,0)/means.length:null,
  residual, corrected:residual===null?null:Math.max(0,seconds+residual)};
}
