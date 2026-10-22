import {ANGLES,validatePhotos,chunkText,uid} from './core.mjs';
import * as db from './store.mjs';
let config=null,online=false,title='';
export const hosted=()=>!!globalThis.google?.script?.run;
export const connected=()=>hosted()&&online;
export function configure(c){config=c;}
export function disconnect(){online=false;}
function rpc(action,payload={}){
 if(!hosted())throw Error('เปิดเว็บผ่าน Apps Script ก่อน เพื่อบันทึกลง Sheets และ Drive');
 if(!config?.sheetId)throw Error('กรุณาระบุ Google Sheet');
 return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(Error(e.message||String(e)))).pimCall({sheetId:config.sheetId,action,payload}));
}
export async function connect(c){configure(c);online=false;const r=await rpc('hello');title=r.title;online=true;}
export async function checkConnection(){return title;}
export async function readTable(name){return rpc('read',{name});}
async function base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('อ่านไฟล์ไม่สำเร็จ'));reader.readAsDataURL(blob);});}
async function upload(blob,p){return rpc('upload',{...p,mime:blob.type||'application/octet-stream',base64:await base64(blob)});}
function assertSheet(record){if(record.sheetId&&record.sheetId!==config.sheetId)throw Error('ข้อมูลนี้เป็นของชีตอื่น กรุณาเลือกชีตเดิม');}
export async function syncImport(batch,products,onProgress=()=>{}){
 assertSheet(batch);
 const imports=await readTable('PIM_Imports');
 if(imports.some(r=>r[0]===batch.id)){batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);return;}
 onProgress('เก็บไฟล์ต้นฉบับใน Drive ผ่าน Apps Script');
 batch.driveId=await upload(batch.file,{key:'import-'+batch.id,kind:'import',name:batch.name});await db.put('imports',batch);
 for(let s=0;s<batch.workbook.sheets.length;s++){
  const sheet=batch.workbook.sheets[s];
  for(let start=0;start<sheet.rows.length;start+=200){onProgress('บันทึก '+sheet.name+' · '+Math.min(start+200,sheet.rows.length)+' / '+sheet.rows.length+' แถว');await rpc('sourceRows',{batchId:batch.id,index:s,rows:sheet.rows.slice(start,start+200).filter(r=>r.cells.length)});}
 }
 const source={properties:batch.workbook.properties,sheetProperties:batch.workbook.sheetProperties,names:batch.workbook.names,sheets:batch.workbook.sheets.map(s=>({name:s.name,range:s.range,merges:s.merges,cells:s.cells}))};
 const chunks=chunkText(JSON.stringify(source));
 for(let n=0;n<chunks.length;n++)await rpc('sourceMeta',{batchId:batch.id,part:n+1,text:chunks[n]});
 const records=products.map(p=>[p.id,p.code,p.name,p.purpose,batch.id,p.sourceSheet,p.sourceRow,p.createdAt]);
 for(let start=0;start<records.length;start+=250)await rpc('products',{rows:records.slice(start,start+250)});
 await rpc('finishImport',{row:[batch.id,batch.name,batch.createdAt,batch.driveId,batch.workbook.sheets.map(s=>s.name).join(' | '),products.length]});
 batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);
}
export async function saveProduct(p,onProgress=()=>{}){
 validatePhotos(p);assertSheet(p);
 const batch=await db.get('imports',p.importId);
 if(batch){assertSheet(batch);if(!batch.synced)await syncImport(batch,(await db.all('products')).filter(x=>x.importId===batch.id),onProgress);}
 const latest=(await readTable('PIM_Revisions')).filter(r=>r[1]===p.id).at(-1);
 if(p.pendingRevision&&latest?.[0]===p.pendingRevision){p.baseRevision=p.pendingRevision;p.pendingRevision=null;p.dirty=false;p.syncedAt=latest[2];p.sheetId=config.sheetId;await db.put('products',p);return;}
 if((latest?.[0]||null)!==(p.baseRevision||null))throw Error('มีเวอร์ชันใหม่ในชีต กรุณาตรวจประวัติก่อนบันทึก');
 for(const a of ANGLES){for(const [i,photo] of (p.photos?.[a.id]||[]).entries()){
  if(photo.fileId)continue;
  const asset=await db.get('assets',photo.id);if(!asset?.blob)throw Error('ไม่พบไฟล์รูปต้นฉบับ กรุณาเลือกรูปใหม่');
  onProgress('อัปโหลด '+a.name+' · '+(i+1)+'/'+p.photos[a.id].length);
  photo.fileId=await upload(asset.blob,{key:'photo-'+photo.id,kind:'photo',productId:p.id,angle:a.id,name:photo.name||p.code+'.jpg'});await db.put('products',p);
 }}
 p.pendingRevision=p.pendingRevision||uid();await db.put('products',p);
 const photos=Object.fromEntries(ANGLES.map(a=>[a.id,(p.photos?.[a.id]||[]).map(x=>({id:x.id,fileId:x.fileId,name:x.name||'',size:x.size||0}))]));
 onProgress('บันทึกเวอร์ชันลง Google Sheet');
 const r=await rpc('revision',{id:p.pendingRevision,productId:p.id,baseRevision:p.baseRevision||null,meta:{fields:p.fields||{},dimensions:p.dimensions||{},purpose:p.purpose||''},photos});
 p.baseRevision=r.id;p.pendingRevision=null;p.dirty=false;p.sheetId=config.sheetId;p.syncedAt=r.at;await db.put('products',p);
}
export async function loadProducts(){
 const completed=new Set((await readTable('PIM_Imports')).map(r=>r[0]));const rows=(await readTable('PIM_Products')).filter(r=>completed.has(r[4]));const revisions=await readTable('PIM_Revisions');const map=new Map();for(const r of revisions)map.set(r[1],r);
 return rows.map(r=>{const rev=map.get(r[0]);const meta=rev?JSON.parse(rev[4]||'{}'):{};return {id:r[0],code:r[1],name:r[2],purpose:meta.purpose??r[3],importId:r[4],sourceSheet:r[5],sourceRow:r[6],createdAt:r[7],fields:meta.fields||{},dimensions:meta.dimensions||{},photos:rev?JSON.parse(rev[5]||'{}'):{},baseRevision:rev?.[0]||null,dirty:false,sheetId:config.sheetId,syncedAt:rev?.[2]||null};});
}
export async function photoBlob(fileId){const r=await rpc('photo',{fileId});return new Blob([Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0))],{type:r.mime});}
