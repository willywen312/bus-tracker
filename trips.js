import {routeKey} from './learning.js';
export function createTrips(db, api, vehicle, changed, failed) {
 const {ref,onValue,set,get,push,runTransaction,serverTimestamp,query,orderByChild,equalTo}=api;
 const base='vehicles/'+vehicle;
 const state={id:null,trip:null,settings:null,history:{},connected:false,offset:0};
 let unsubscribe=()=>{};
 const now=()=>Date.now()+state.offset;
 onValue(ref(db,'.info/connected'),s=>{state.connected=s.val()===true;changed(state);});
 onValue(ref(db,'.info/serverTimeOffset'),s=>{state.offset=Number(s.val())||0;});
 onValue(ref(db,base+'/learningSettings'),s=>{state.settings=s.val();changed(state);},failed);
 onValue(query(ref(db,'trips'),orderByChild('vehicleId'),equalTo(vehicle)),s=>{state.history=s.val()||{};changed(state);},failed);
 onValue(ref(db,base+'/activeTripId'),s=>{
  unsubscribe(); state.id=s.val();state.trip=null;changed(state);
  if(state.id) unsubscribe=onValue(ref(db,'trips/'+state.id),t=>{state.trip=t.val();changed(state);},failed);
 },failed);
 function online(){if(!state.connected)throw Error('Firebase 未連線，請恢復網路後重試。');}
 async function mutate(id,fn){
  online(); const r=ref(db,'trips/'+id); await get(r);
  return runTransaction(r,t=>t?.status==='active'?fn(t):undefined,{applyLocally:false});
 }
 async function release(id){await runTransaction(ref(db,base+'/activeTripId'),v=>v===id?null:undefined,{applyLocally:false});}
 return {state,now,
  async settings(destination,route){online(); if(state.id)throw Error('請先結束目前行程，再更改學習路線。');await set(ref(db,base+'/learningSettings'),{destination,route:route.trim()||'下午接送'});},
  async start(){
   online();if(state.id){if(state.trip?.status==='active')return state.id;await release(state.id);}
   const settings=(await get(ref(db,base+'/learningSettings'))).val();
   if(!settings?.destination)throw Error('請先在家長端儲存目的地與學習路線。');
   const id=push(ref(db,'trips')).key;
   await set(ref(db,'trips/'+id),{version:3,vehicleId:vehicle,status:'active',startTime:serverTimestamp(),destination:settings.destination,route:settings.route,routeKey:routeKey(vehicle,settings.route,settings.destination)});
   const claim=await runTransaction(ref(db,base+'/activeTripId'),v=>v===null?id:undefined,{applyLocally:false});
   if(!claim.committed){await set(ref(db,'trips/'+id+'/status'),'abandoned');throw Error('其他裝置已開始行程，請重新整理以接續。');}
   return id;
  },
  async finish(arrived){
   online(); const id=state.id;if(!id)throw Error('目前沒有行程。');
   await mutate(id,t=>({...t,status:arrived?'arrived':'ended',endTime:serverTimestamp(),...(arrived?{actualArrivalTime:serverTimestamp()}: {})}));
   await release(id);
  },
  async point(id,p){return mutate(id,t=>{t.points||={};t.points[String(Math.round(p.timestamp))]=p;return t;});},
  async sample(id,s){return mutate(id,t=>{
   if(s.timestamp<t.startTime)return;
   t.etaSamples||={};const k=String(Math.floor(s.timestamp/30000));
   if(t.etaSamples[k])return; t.etaSamples[k]=s;return t;
  });}
 };
}
