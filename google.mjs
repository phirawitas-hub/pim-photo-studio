import {bridgeCall,resetBridge,prepareBridge,bridgeAlive} from './bridge.mjs?v=20261026viewer';
import {ANGLES,validatePhotos,chunkText,uid} from './core.mjs';
import * as db from './store.mjs';
let config=null,online=false,title='';
export const hosted=()=>!!globalThis.google?.script?.run;
export const connected=()=>online&&(hosted()||bridgeAlive());
export function configure(c){config=c;}
export function warmup(){if(!hosted())prepareBridge().catch(()=>{});}
export function disconnect(){online=false;resetBridge();}
function rpc(action,payload={}){
 const request={sheetId:config?.sheetId||'',action,payload};
 if(!hosted())return bridgeCall(request).catch(e=>{if(e.code==='CONNECTION')online=false;throw e;});
 return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(Error(e.message||String(e)))).pimCall(request));
}
export async function connect(c,usePopup=false){configure(c);online=false;if(usePopup&&!hosted())await prepareBridge(true);const r=await rpc('hello');title=r.title;config.sheetId=r.sheetId;await db.put('settings',config);online=true;}
export async function syncData(batchId){let offset=0;do{const r=await rpc('syncData',{batchId,offset});offset=r.next;}while(offset!==null);}
export async function checkConnection(){return title;}
export async function readTable(name){return rpc('read',{name});}
async function base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('อ่านไฟล์ไม่สำเร็จ'));reader.readAsDataURL(blob);});}
async function upload(blob,p){return rpc('upload',{...p,mime:blob.type||'application/octet-stream',base64:await base64(blob)});}
function assertSheet(record){if(record.sheetId&&record.sheetId!==config.sheetId)throw Error('ข้อมูลนี้เป็นของชีตอื่น กรุณาเลือกชีตเดิม');}
export async function syncImport(batch,products,onProgress=()=>{}){
 assertSheet(batch);
 const imports=await readTable('PIM_Imports');
 if(imports.some(r=>r[0]===batch.id)){await syncData(batch.id);batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);return;}
 onProgress('เก็บไฟล์ต้นฉบับใน Drive ผ่าน Apps Script');
 batch.driveId=await upload(batch.file,{key:'import-'+batch.id,kind:'import',name:batch.name});await db.put('imports',batch);
 const source={properties:batch.workbook.properties,sheetProperties:batch.workbook.sheetProperties,names:batch.workbook.names,sheets:batch.workbook.sheets.map(s=>({name:s.name,range:s.range,merges:s.merges,cells:s.cells}))};
 const chunks=chunkText(JSON.stringify(source));
 for(let n=0;n<chunks.length;n++)await rpc('sourceMeta',{batchId:batch.id,part:n+1,text:chunks[n]});
 const records=products.map(p=>[p.id,p.code,p.name,p.purpose,batch.id,p.sourceSheet,p.sourceRow,p.createdAt]);
 for(let start=0;start<records.length;start+=250)await rpc('products',{rows:records.slice(start,start+250)});
 await rpc('finishImport',{row:[batch.id,batch.name,batch.createdAt,batch.driveId,batch.workbook.sheets.map(s=>s.name).join(' | '),products.length]});
 await syncData(batch.id);batch.synced=true;batch.sheetId=config.sheetId;await db.put('imports',batch);
}
export async function saveProduct(p,onProgress=()=>{}){
 validatePhotos(p);assertSheet(p);if(!p.dirty&&p.baseRevision)return;
 const batch=await db.get('imports',p.importId);
 if(batch){assertSheet(batch);if(!batch.synced)await syncImport(batch,(await db.all('products')).filter(x=>x.importId===batch.id),onProgress);}
 const history=await itemHistory(p.code),latest=history.at(-1);
 if(!String(p.fields?.photographer||'').trim())throw Error('กรุณาระบุชื่อผู้ถ่าย');
 if(p.pendingRevision&&latest?.[0]===p.pendingRevision){await rpc('revision',{id:p.pendingRevision,productId:p.id});p.baseRevision=p.pendingRevision;p.itemHead=p.pendingRevision;p.revisionNumber=history.length;p.newRevision=false;p.pendingRevision=null;p.dirty=false;p.syncedAt=latest[2];p.sheetId=config.sheetId;await db.put('products',p);return;}
 if(!p.itemHead&&!p.baseRevision&&latest){p.itemHead=latest[0];await db.put('products',p);}
 if((latest?.[0]||null)!==(p.itemHead||p.baseRevision||null))throw Error('มีเวอร์ชันใหม่ในชีต กรุณาตรวจประวัติก่อนบันทึก');
 for(const a of ANGLES){for(const [i,photo] of (p.photos?.[a.id]||[]).entries()){
  if(photo.fileId)continue;
  const asset=await db.get('assets',photo.id);if(!asset?.blob)throw Error('ไม่พบไฟล์รูปต้นฉบับ กรุณาเลือกรูปใหม่');
  onProgress('อัปโหลด '+a.name+' · '+(i+1)+'/'+p.photos[a.id].length);
  photo.fileId=await upload(asset.blob,{key:'photo-'+photo.id,kind:'photo',productId:p.id,angle:a.id,name:photo.name||p.code+'.jpg'});await db.put('products',p);
 }}
 p.pendingRevision=p.pendingRevision||uid();await db.put('products',p);
 const photos=Object.fromEntries(ANGLES.map(a=>[a.id,(p.photos?.[a.id]||[]).map(x=>({id:x.id,fileId:x.fileId,name:x.name||'',size:x.size||0}))]));
 onProgress('บันทึกเวอร์ชันลง Google Sheet');
 const r=await rpc('revision',{id:p.pendingRevision,productId:p.id,baseRevision:p.itemHead||p.baseRevision||null,meta:{fields:p.fields||{},dimensions:p.dimensions||{},purpose:p.purpose||''},photos});
 p.baseRevision=r.id;p.itemHead=r.id;p.revisionNumber=r.number;p.newRevision=false;p.pendingRevision=null;p.dirty=false;p.sheetId=config.sheetId;p.syncedAt=r.at;await db.put('products',p);
}
export async function itemHistory(code){return rpc('itemHistory',{code});}
export async function stock(code){return rpc('stock',{code});}
export async function selectRevision(p,revisionId){assertSheet(p);const r=await rpc('selectRevision',{productId:p.id,revisionId});const history=await itemHistory(p.code);applyRevision(p,r.revision,history);p.syncedAt=r.at;await db.put('products',p);return p;}
export function applyRevision(p,rev,history){const meta=rev?JSON.parse(rev[4]||'{}'):{};p.fields=meta.fields||{};p.dimensions=meta.dimensions||{};p.photos=rev?JSON.parse(rev[5]||'{}'):{};p.baseRevision=rev?.[0]||null;p.itemHead=history.at(-1)?.[0]||null;p.revisionNumber=rev?(meta.revisionNumber||history.findIndex(r=>r[0]===rev[0])+1):0;p.newRevision=false;p.pendingRevision=null;p.dirty=false;p.syncedAt=rev?.[2]||null;p.sheetId=config.sheetId;}
export async function loadProducts(snapshot){
 const data=snapshot||await rpc('snapshot');const completed=new Set(data.imports.map(r=>r[0])),rows=data.products.filter(r=>completed.has(r[4])),revisions=data.revisions,selections=data.selections;
 const key=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
 return rows.map(r=>{const ids=new Set(rows.filter(x=>key(x[1])===key(r[1])).map(x=>x[0])),history=revisions.filter(x=>ids.has(x[1])),selection=selections.filter(x=>x[0]===r[0]).at(-1),rev=selection?history.find(x=>x[0]===selection[1]):history.filter(x=>x[1]===r[0]).at(-1);const p={id:r[0],code:r[1],name:r[2],purpose:r[3],importId:r[4],sourceSheet:r[5],sourceRow:r[6],createdAt:r[7]};applyRevision(p,rev,history);p.syncedAt=selection?.[2]||p.syncedAt;p.importSynced=true;return p;});
}
export async function photoBlob(fileId){const r=await rpc('photo',{fileId});return new Blob([Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0))],{type:r.mime});}

export const workspace=()=>rpc('workspace');
export const changeOption=(kind,value,operation)=>rpc('option',{kind,value,operation});

export const snapshot=()=>rpc('snapshot');
export const saveBranding=brand=>rpc('branding',brand);

export const deletePreview=(batchId,batchName)=>rpc('deletePreview',{batchId,batchName});
export const deleteImport=(batchId,confirmName)=>rpc('deleteImport',{batchId,batchName:confirmName,confirmName});
