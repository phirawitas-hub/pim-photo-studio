import * as db from './store.mjs';
import {ANGLES,validatePhotos} from './core.mjs';
const encode=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({type:blob.type,data:r.result.split(',')[1]});r.onerror=reject;r.readAsDataURL(blob);});
function decode(value,max){
 if(!value||typeof value.data!=='string'||value.data.length>Math.ceil(max/3)*4)throw Error('ไฟล์ในฉบับร่างใหญ่เกินกำหนด');
 const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));if(bytes.length>max)throw Error('ไฟล์ใหญ่เกินกำหนด');return new Blob([bytes],{type:value.type||'application/octet-stream'});
}
export async function exportDrafts(){
 const products=await db.all('products'),imports=await db.all('imports'),assets=await db.all('assets');
 const snapshot={format:'pim-drafts-v1',products,imports:[],assets:[]};
 for(const b of imports)snapshot.imports.push({...b,file:b.file?await encode(b.file):null});
 for(const a of assets)snapshot.assets.push({...a,blob:a.blob?await encode(a.blob):null});
 const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='pim-drafts-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function restoreDrafts(file){
 if(file.size>300*1024*1024)throw Error('ไฟล์ฉบับร่างต้องไม่เกิน 300 MB');
 const data=JSON.parse(await file.text());
 if(data.format!=='pim-drafts-v1'||!['products','imports','assets'].every(k=>Array.isArray(data[k])))throw Error('ไม่ใช่ไฟล์ฉบับร่าง PIM');
 const id=v=>{if(typeof v!=='string'||!/^[-\w]{1,120}$/.test(v))throw Error('รหัสฉบับร่างไม่ถูกต้อง');};
 for(const k of ['products','imports','assets']){const seen=new Set();for(const row of data[k]){id(row.id);if(seen.has(row.id))throw Error('รหัสซ้ำในไฟล์');seen.add(row.id);}}
 for(const p of data.products){
  if(typeof p.code!=='string'||typeof p.name!=='string')throw Error('ข้อมูลสินค้าไม่ครบ');
  if(p.importId)id(p.importId);if(p.sheetId)id(p.sheetId);validatePhotos(p);
  for(const a of ANGLES)for(const ph of p.photos?.[a.id]||[]){id(ph.id);if(ph.fileId)id(ph.fileId);}
 }
 for(const b of data.imports){if(!b.workbook?.sheets||!Array.isArray(b.workbook.sheets))throw Error('ไม่พบข้อมูลต้นฉบับ');if(b.driveId)id(b.driveId);if(b.sheetId)id(b.sheetId);if(b.file)b.file=decode(b.file,25*1024*1024);}
 for(const a of data.assets){if(a.blob)a.blob=decode(a.blob,20*1024*1024);}
 // Validate the entire transfer before writing. Existing local work always wins.
 for(const [store,rows] of [['assets',data.assets],['imports',data.imports],['products',data.products]])for(const row of rows)if(!await db.get(store,row.id))await db.put(store,row);
 return data.products.length;
}
