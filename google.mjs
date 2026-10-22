import {ANGLES,validatePhotos,chunkText,uid} from './core.mjs';
import * as db from './store.mjs';
const SHEETS='https://sheets.googleapis.com/v4/spreadsheets/';
const DRIVE='https://www.googleapis.com/drive/v3/';
const scopes=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.file'];
let token=null,expires=0;
let config=null;
const schema={
 PIM_Products:['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At'],
 PIM_Revisions:['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON'],
 PIM_Imports:['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
 PIM_Source:['id','Part','Source Metadata JSON']
};
export const connected=()=>!!token&&Date.now()<expires;
export function configure(c){config=c;}
export function disconnect(){token=null;expires=0;}
export async function connect(c){
 configure(c);
 if(!c.clientId?.endsWith('.apps.googleusercontent.com'))throw Error('กรุณาตั้งค่า Google OAuth Client ID ก่อน');
 if(!globalThis.google?.accounts?.oauth2)throw Error('ยังโหลด Google Sign-in ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
 return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:c.clientId,scope:scopes.join(' '),callback:r=>{
 if(r.error)return reject(Error(r.error_description||r.error));
 if(!google.accounts.oauth2.hasGrantedAllScopes(r,...scopes))return reject(Error('ต้องอนุญาต Google Sheets และ Drive เพื่อใช้งานการบันทึก'));
 token=r.access_token;expires=Date.now()+Math.max(0,Number(r.expires_in)-60)*1000;resolve();
 },error_callback:e=>reject(Error(e.type==='popup_closed'?'ยกเลิกการเชื่อมต่อ Google':'เปิดหน้าลงชื่อเข้าใช้ไม่ได้ โปรดอนุญาตป๊อปอัป'))});client.requestAccessToken({prompt:'select_account'});});
}
async function api(url,options={}){
 if(!connected())throw Error('กรุณาเชื่อมต่อ Google อีกครั้งก่อนบันทึก ข้อมูลฉบับร่างยังอยู่ในเครื่อง');
 let response;try{response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});}catch{throw Error('การเชื่อมต่อขัดข้อง กรุณาตรวจอินเทอร์เน็ต ข้อมูลยังอยู่ในเครื่อง');}
 if(response.status===401){disconnect();throw Error('สิทธิ์ Google หมดอายุ กรุณาเชื่อมต่อใหม่แล้วกดบันทึกอีกครั้ง');}
 if(!response.ok){let e;try{e=await response.json();}catch{}throw Error(e?.error?.message||'Google API error '+response.status);}
 return response;
}
async function json(url,method='GET',body){const r=await api(url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return r.status===204?{}:r.json();}
function base(){if(!config?.sheetId)throw Error('ยังไม่ได้ระบุ Google Sheet');return SHEETS+encodeURIComponent(config.sheetId);}
async function metadata(){return json(base()+'?fields=spreadsheetId,properties(title),sheets(properties)');}
async function values(range){return (await json(base()+'/values/'+encodeURIComponent(range))).values||[];}
export async function readTable(name){
 const meta=await metadata();const sheet=meta.sheets?.find(s=>s.properties.title===name);if(!sheet)return [];
 const count=sheet.properties.gridProperties.rowCount;const rows=[];
 for(let start=2;start<=count;start+=1000){rows.push(...await values("'"+name+"'!A"+start+':H'+Math.min(start+999,count)));}
 return rows.filter(r=>r[0]);
}
async function append(name,rows){if(!rows.length)return;return json(base()+'/values/'+encodeURIComponent("'"+name+"'!A1")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:rows});}
async function ensureSchema(){
 const meta=await metadata();
 for(const [name,header] of Object.entries(schema)){
  let existing=meta.sheets?.find(s=>s.properties.title===name);
  if(!existing){try{await json(base()+':batchUpdate','POST',{requests:[{addSheet:{properties:{title:name,gridProperties:{rowCount:1000,columnCount:Math.max(8,header.length),frozenRowCount:1}}}}]});}catch(e){const again=await metadata();if(!again.sheets?.some(s=>s.properties.title===name))throw e;}}
  const current=await values("'"+name+"'!A1:H1");
  if(current.length&&current[0].join('|')!==header.join('|'))throw Error('พบแท็บ '+name+' ที่มีโครงสร้างต่างกัน กรุณาเลือกชีตใหม่เพื่อป้องกันข้อมูลเดิม');
  if(!current.length)await json(base()+'/values/'+encodeURIComponent("'"+name+"'!A1")+'?valueInputOption=RAW','PUT',{values:[header]});
 }
}
async function generatedId(){return (await json(DRIVE+'files/generateIds?count=1&space=drive')).ids[0];}
async function exists(id){try{return await json(DRIVE+'files/'+encodeURIComponent(id)+'?fields=id,name');}catch(e){if(/not found|404/i.test(e.message))return null;throw e;}}
async function folder(name,key,parent){
 const q="trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='pimKey' and value='"+key.replace(/'/g,"\\'")+"' }";
 const found=await json(DRIVE+'files?q='+encodeURIComponent(q)+'&fields=files(id,name)&pageSize=10');
 if(found.files?.length)return found.files[0].id;
 return (await json(DRIVE+'files?fields=id','POST',{name,mimeType:'application/vnd.google-apps.folder',appProperties:{pimKey:key},...(parent?{parents:[parent]}:{})})).id;
}
async function upload(id,blob,name,parent){
 const present=await exists(id);if(present)return id;
 const mime=blob.type||'application/octet-stream';
 const init=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':mime},body:JSON.stringify({id,name,mimeType:mime,parents:[parent]})});
 const location=init.headers.get('Location');
 if(!location||!location.startsWith('https://www.googleapis.com/'))throw Error('Google ไม่ส่ง URL อัปโหลดที่ถูกต้อง');
 await api(location,{method:'PUT',headers:{'Content-Type':mime},body:blob});
 return id;
}
async function ensureRoot(){return folder('PIM Photo Studio','root-'+config.sheetId);}
export async function checkConnection(){const m=await metadata();return m.properties.title;}
export async function syncImport(batch,products,onProgress=()=>{}){
 await ensureSchema();const imports=await readTable('PIM_Imports');
 if(imports.some(r=>r[0]===batch.id)){batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);return;}
 onProgress('กำลังเก็บไฟล์ต้นฉบับใน Drive');
 const root=await ensureRoot();const importsFolder=await folder('Imports','imports-'+config.sheetId,root);
 if(!batch.driveId){batch.driveId=await generatedId();await db.put('imports',batch);}
 await upload(batch.driveId,batch.file,batch.name,importsFolder);
 // Readable source values in one dedicated tab per imported worksheet.
 for(let s=0;s<batch.workbook.sheets.length;s++){
  const sheet=batch.workbook.sheets[s];const name='IMP_'+batch.id.slice(0,8)+'_'+String(s+1);
  const rowCount=Math.max(10,...sheet.rows.map(r=>r.number));
  const colCount=Math.max(1,...sheet.rows.map(r=>r.cells.length));
  if(rowCount*colCount>2000000)throw Error('ช่วงข้อมูลมีขนาดเกิน 2 ล้านเซลล์ กรุณาตัดแถวว่างไกลตารางก่อนนำเข้า');
  const meta=await metadata();if(!meta.sheets.some(x=>x.properties.title===name))await json(base()+':batchUpdate','POST',{requests:[{addSheet:{properties:{title:name,gridProperties:{rowCount,columnCount:colCount}}}}]});
  for(let start=0;start<sheet.rows.length;start+=200){
   const page=sheet.rows.slice(start,start+200);
   onProgress('บันทึกแท็บ '+sheet.name+' · '+Math.min(start+200,sheet.rows.length)+' / '+sheet.rows.length+' แถว');
   await json(base()+'/values:batchUpdate','POST',{valueInputOption:'RAW',data:page.map(r=>({range:"'"+name+"'!A"+r.number,values:[r.cells]}))});
  }
 }
 const source={properties:batch.workbook.properties,sheetProperties:batch.workbook.sheetProperties,names:batch.workbook.names,sheets:batch.workbook.sheets.map(s=>({name:s.name,range:s.range,merges:s.merges,cells:s.cells}))};
 const sourceRows=await readTable('PIM_Source');const parts=new Set(sourceRows.filter(r=>r[0]===batch.id).map(r=>Number(r[1])));
 const chunks=chunkText(JSON.stringify(source));
 for(let n=0;n<chunks.length;n++)if(!parts.has(n+1))await append('PIM_Source',[[batch.id,n+1,chunks[n]]]);
 const existing=new Set((await readTable('PIM_Products')).map(r=>r[0]));
 const records=products.filter(p=>!existing.has(p.id)).map(p=>[p.id,p.code,p.name,p.purpose,batch.id,p.sourceSheet,p.sourceRow,p.createdAt]);
 for(let start=0;start<records.length;start+=250)await append('PIM_Products',records.slice(start,start+250));
 await append('PIM_Imports',[[batch.id,batch.name,batch.createdAt,batch.driveId,batch.workbook.sheets.map(s=>s.name).join(' | '),products.length]]);
 batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);
}
function latest(rows,productId){return rows.filter(r=>r[1]===productId).at(-1);}
export async function saveProduct(p,onProgress=()=>{}){
 validatePhotos(p);await ensureSchema();
 if(p.sheetId&&p.sheetId!==config.sheetId)throw Error('สินค้านี้มาจาก Google Sheet อื่น กรุณาเลือกชีตเดิม');
 const existing=latest(await readTable('PIM_Revisions'),p.id);
 if(p.pendingRevision&&existing?.[0]===p.pendingRevision){p.baseRevision=p.pendingRevision;p.pendingRevision=null;p.dirty=false;p.syncedAt=existing[2];p.sheetId=config.sheetId;await db.put('products',p);return;}
 if((existing?.[0]||null)!==(p.baseRevision||null))throw Error('มีเวอร์ชันใหม่บนชีต กรุณารีเฟรชและตรวจเวอร์ชันก่อนบันทึก เพื่อไม่ทับงานผู้อื่น');
 const batch=await db.get('imports',p.importId);
 if(batch&&!batch.synced){await syncImport(batch,(await db.all('products')).filter(x=>x.importId===batch.id),onProgress);}
 const root=await ensureRoot();const productFolder=await folder(p.code,p.id,root);
 for(const a of ANGLES){
  const photos=p.photos?.[a.id]||[];if(!photos.length)continue;
  const angleFolder=await folder(a.name,p.id+'-'+a.id,productFolder);
  for(let i=0;i<photos.length;i++){
   const photo=photos[i];if(photo.fileId)continue;
   const asset=await db.get('assets',photo.id);if(!asset?.blob)throw Error('ไม่พบไฟล์ต้นฉบับของรูป กรุณาเลือกรูปใหม่');
   if(!asset.driveId){asset.driveId=await generatedId();await db.put('assets',asset);}
   onProgress('อัปโหลด '+a.name+' · '+(i+1)+'/'+photos.length);
   await upload(asset.driveId,asset.blob,p.code+'_'+a.id+'_'+photo.id+'.'+(asset.blob.type==='image/png'?'png':asset.blob.type==='image/webp'?'webp':'jpg'),angleFolder);
   photo.fileId=asset.driveId;await db.put('products',p);
  }
 }
 // Recheck after lengthy uploads; editors should work on separate products.
 const before=latest(await readTable('PIM_Revisions'),p.id);
 if((before?.[0]||null)!==(p.baseRevision||null))throw Error('มีผู้บันทึกสินค้านี้ระหว่างอัปโหลด รูปอยู่ใน Drive แล้ว กรุณาตรวจเวอร์ชันใหม่ก่อนลองอีกครั้ง');
 const revision=p.pendingRevision||uid();p.pendingRevision=revision;await db.put('products',p);
 const meta={fields:p.fields||{},dimensions:p.dimensions||{},purpose:p.purpose};
 const photos=Object.fromEntries(ANGLES.map(a=>[a.id,(p.photos?.[a.id]||[]).map(x=>({id:x.id,fileId:x.fileId,name:x.name,size:x.size}))]));
 onProgress('บันทึกลิงก์รูปและรายละเอียดลงชีต');
 await append('PIM_Revisions',[[revision,p.id,new Date().toISOString(),validatePhotos(p).length===0,JSON.stringify(meta),JSON.stringify(photos)]]);
 p.baseRevision=revision;p.pendingRevision=null;p.dirty=false;p.sheetId=config.sheetId;p.syncedAt=new Date().toISOString();await db.put('products',p);
}
export async function loadProducts(){
 const completedImports=new Set((await readTable('PIM_Imports')).map(r=>r[0]));const productRows=(await readTable('PIM_Products')).filter(r=>completedImports.has(r[4]));const revisions=await readTable('PIM_Revisions');
 const map=new Map();for(const row of revisions)map.set(row[1],row);
 return productRows.map(r=>{const rev=map.get(r[0]);let meta={},photos={};try{if(rev){meta=JSON.parse(rev[4]||'{}');photos=JSON.parse(rev[5]||'{}');}}catch{throw Error('ข้อมูลเวอร์ชันในชีตไม่ถูกต้องสำหรับ '+r[1]);}
 return {id:r[0],code:r[1],name:r[2],purpose:meta.purpose??r[3],importId:r[4],sourceSheet:r[5],sourceRow:r[6],createdAt:r[7],fields:meta.fields||{},dimensions:meta.dimensions||{},photos,baseRevision:rev?.[0]||null,dirty:false,sheetId:config.sheetId,syncedAt:rev?.[2]||null};});
}
export async function photoBlob(fileId){return (await api(DRIVE+'files/'+encodeURIComponent(fileId)+'?alt=media')).blob();}
