import {SCRIPT_URL} from './deployment.mjs';
let frame,peer,peerOrigin,readyPromise,readyTimer,readyListener,readyReject;const pending=new Map();
let channel='';
export function resetBridge(){clearTimeout(readyTimer);if(readyListener)window.removeEventListener('message',readyListener);readyReject?.(Error('การเชื่อมต่อถูกรีเซ็ต'));readyReject=null;frame?.remove();frame=null;peer=null;readyPromise=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('การเชื่อมต่อถูกรีเซ็ต'));}pending.clear();}
export function prepareBridge(){
 if(readyPromise)return readyPromise;
 if(location.origin!=='https://phirawitas-hub.github.io')return Promise.reject(Error('การเชื่อม Google ใช้ได้จากเว็บ GitHub ที่ตั้งค่าไว้เท่านั้น'));
 channel=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 readyPromise=new Promise((resolve,reject)=>{
  readyReject=reject;const timer=readyTimer=setTimeout(()=>{readyReject=null;window.removeEventListener('message',readyListener);readyPromise=null;frame?.remove();reject(Error('เชื่อม Google ไม่สำเร็จ กรุณาเข้าสู่ระบบ Google ในหน้าการเชื่อมต่อ แล้วลองอีกครั้ง'));},90000);
  const ready=readyListener=e=>{if(e.data?.channel!==channel||e.data?.type!=='pim-ready'||!/^https:\/\/[a-z0-9-]+\.script\.googleusercontent\.com$|^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin))return;peer=e.source;peerOrigin=e.origin;clearTimeout(timer);readyReject=null;window.removeEventListener('message',ready);resolve();};
  window.addEventListener('message',ready);frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.loading='eager';frame.style.cssText='position:fixed;left:-1200px;top:0;width:800px;height:600px;border:0;pointer-events:none';frame.title='เชื่อมต่อ Google ส่วนตัว';frame.src=SCRIPT_URL+'?bridge=1&channel='+channel;document.body.append(frame);
 });return readyPromise;
}
window.addEventListener('message',e=>{if(e.source!==peer||e.origin!==peerOrigin||e.data?.channel!==channel||e.data?.type!=='pim-response')return;const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);clearTimeout(p.timer);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.value);});
export async function bridgeCall(request){await prepareBridge();return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Google ใช้เวลาตอบนาน กรุณาลองอีกครั้ง ข้อมูลฉบับร่างยังอยู่'));},180000);pending.set(id,{resolve,reject,timer});peer.postMessage({type:'pim-request',channel,id,request},peerOrigin);});}
