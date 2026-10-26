import {SCRIPT_URL} from './deployment.mjs';
const KEY='pim-google-channel';
const trustedOrigin=o=>/^https:\/\/[a-z0-9-]+(?:\.script|-script)\.googleusercontent\.com$/.test(o);
let frame,popupWindow,peer,peerOrigin,readyPromise,readyTimer,frameTimer,readyResolve,readyReject,lastSeen=0;
const pending=new Map();
let channel='';
try{channel=sessionStorage.getItem(KEY)||'';}catch{}
if(!/^[a-f0-9]{64}$/.test(channel))channel='';
const connectionError=message=>Object.assign(Error(message),{code:'CONNECTION'});
export const bridgeAlive=()=>!!peer&&Date.now()-lastSeen<150000&&(!popupWindow||!popupWindow.closed);
function clearReady(){clearTimeout(readyTimer);clearTimeout(frameTimer);readyResolve=null;readyReject=null;}
export function resetBridge(){
 const reject=readyReject;clearReady();reject?.(connectionError('การเชื่อมต่อถูกรีเซ็ต'));
 frame?.remove();popupWindow?.close();popupWindow=null;frame=null;peer=null;peerOrigin=null;lastSeen=0;readyPromise=null;
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(connectionError('การเชื่อมต่อถูกรีเซ็ต'));}pending.clear();
}
function rememberChannel(){if(!channel)channel=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');try{sessionStorage.setItem(KEY,channel);}catch{}}
window.addEventListener('message',e=>{
 if(e.data?.channel!==channel||!channel||!trustedOrigin(e.origin))return;
 if(e.data.type==='pim-ready'){
  if(peer&&e.source!==peer)return;
  peer=e.source;peerOrigin=e.origin;lastSeen=Date.now();
  const resolve=readyResolve;clearReady();resolve?.();return;
 }
 if(e.source!==peer||e.origin!==peerOrigin||e.data.type!=='pim-response')return;
 lastSeen=Date.now();const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);clearTimeout(p.timer);
 e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.value);
});
export function prepareBridge(usePopup=false){
 if(bridgeAlive())return Promise.resolve();
 if(readyPromise)return readyPromise;
 if(location.origin!=='https://phirawitas-hub.github.io')return Promise.reject(connectionError('การเชื่อม Google ใช้ได้จากเว็บ GitHub ที่ตั้งค่าไว้เท่านั้น'));
 peer=null;peerOrigin=null;rememberChannel();
 const promise=new Promise((resolve,reject)=>{
  readyResolve=resolve;readyReject=reject;
  readyTimer=setTimeout(()=>{clearReady();frame?.remove();frame=null;reject(connectionError('ยังเชื่อม Google ไม่ได้ ระบบจะลองใหม่อัตโนมัติ หรือกดเชื่อมต่อในหน้าตั้งค่า'));},usePopup?90000:12000);
  const url=SCRIPT_URL+'?bridge=1&channel='+channel;
  if(usePopup){
   popupWindow=window.open(url,'pimGoogleConnection','width=520,height=420');
   if(!popupWindow){clearReady();reject(connectionError('กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้ แล้วกดเชื่อมต่อ Google อีกครั้ง'));}return;
  }
  // First give an already-open authenticated popup time to reattach after reload.
  frameTimer=setTimeout(()=>{
   if(peer)return;frame?.remove();frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.loading='eager';frame.style.cssText='position:fixed;left:-1200px;top:0;width:800px;height:600px;border:0;pointer-events:none';frame.title='เชื่อมต่อ Google ส่วนตัว';frame.src=url;document.body.append(frame);
  },4000);
 });
 readyPromise=promise;promise.then(()=>{if(readyPromise===promise)readyPromise=null;},()=>{if(readyPromise===promise)readyPromise=null;});return promise;
}
export async function bridgeCall(request){
 await prepareBridge();return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);peer=null;reject(connectionError('Google ใช้เวลาตอบนาน ระบบจะเชื่อมกลับอัตโนมัติ ข้อมูลฉบับร่างยังอยู่'));},180000);
  pending.set(id,{resolve,reject,timer});
  try{peer.postMessage({type:'pim-request',channel,id,request},peerOrigin);}catch{clearTimeout(timer);pending.delete(id);peer=null;reject(connectionError('การเชื่อมต่อขาดชั่วคราว ระบบจะลองใหม่'));}
 });
}
