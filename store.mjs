import {MAX_PHOTOS,angleNotApplicable} from './core.mjs';
const ready=new Promise((resolve,reject)=>{const request=indexedDB.open('pim-photo-studio-v1',1);request.onupgradeneeded=()=>{for(const name of ['products','imports','assets','settings'])request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function action(name,mode,operation){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);const r=operation(tx.objectStore(name));let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('พื้นที่เก็บข้อมูลไม่พอ'));});}
export const get=(name,id)=>action(name,'readonly',s=>s.get(id));
export const all=name=>action(name,'readonly',s=>s.getAll());
export const put=(name,value)=>action(name,'readwrite',s=>s.put(value));
export const remove=(name,id)=>action(name,'readwrite',s=>s.delete(id));
export async function commitImport(batch,products){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(['imports','products'],'readwrite');tx.objectStore('imports').put(batch);for(const p of products)tx.objectStore('products').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}

// Commit all chosen images with their gallery entries, including on storage failure.
export async function appendPhotos(productId,angle,assets,photographer){
 const db=await ready;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['products','assets'],'readwrite');
  const products=tx.objectStore('products'),read=products.get(productId);
  let updated,failure;
  read.onsuccess=()=>{
   const job=read.result;
   const photos=job?.photos?.[angle]||[];
   if(job&&angleNotApplicable(job,angle)){failure=Error('กดกลับมาถ่ายมุมนี้ก่อนเพิ่มรูป');tx.abort();return;}
   if(!job||job.closed||photos.length+assets.length>MAX_PHOTOS){
    failure=Error(!job||job.closed?'งานนี้ถูกปิดหรือลบแล้ว':'จำนวนรูปในมุมนี้เกิน '+MAX_PHOTOS+' รูป');
    tx.abort();return;
   }
   const added=assets.map(({id,blob,name})=>({id,name:name||blob.name||'photo.jpg',size:blob.size}));
   updated={...job,photos:{...job.photos,[angle]:[...photos,...added]},fields:{...job.fields,photographer},
    updatedAt:new Date().toISOString(),dirty:true,pendingRevision:null};
   for(const asset of assets)tx.objectStore('assets').add(asset);
   products.put(updated);
  };
  tx.oncomplete=()=>resolve(updated);
  tx.onabort=()=>reject(failure||tx.error||Error('บันทึกรูปในเครื่องไม่สำเร็จ'));
 });
}

export async function setAngleWaiver(productId,angle,waived){
 const db=await ready;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('products','readwrite'),store=tx.objectStore('products'),read=store.get(productId);
  let job;
  read.onsuccess=()=>{
   job=read.result;
   if(!job||job.closed||job.photos?.[angle]?.length){tx.abort();return;}
   job.fields??={};
   const ids=new Set(job.fields.notApplicableAngles||[]);
   if(waived)ids.add(angle);else ids.delete(angle);
   if(ids.size)job.fields.notApplicableAngles=[...ids].sort();else delete job.fields.notApplicableAngles;
   job.dirty=true;job.pendingRevision=null;job.updatedAt=new Date().toISOString();
   store.put(job);
  };
  tx.oncomplete=()=>resolve(job);
  tx.onabort=()=>reject(tx.error||Error('สถานะงานหรือรูปในมุมนี้เปลี่ยนแล้ว'));
 });
}

// Merge Drive IDs in one transaction while the user can still add library photos.
export async function markPhotoUploaded(productId,photoId,fileId){
 const db=await ready;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('products','readwrite'),store=tx.objectStore('products'),read=store.get(productId);
  read.onsuccess=()=>{
   const job=read.result;
   const photo=Object.values(job?.photos||{}).flat().find(entry=>entry.id===photoId);
   if(photo){photo.fileId=fileId;store.put(job);}
  };
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(tx.error||Error('บันทึกลิงก์รูปในเครื่องไม่สำเร็จ'));
 });
}

export async function deleteBatch(batchId){
 const connection=await ready;return new Promise((resolve,reject)=>{const tx=connection.transaction(['imports','products','assets'],'readwrite'),store=tx.objectStore('products'),read=store.getAll();read.onsuccess=()=>{const rows=read.result,keep=new Set(rows.filter(p=>p.importId!==batchId).flatMap(p=>Object.values(p.photos||{}).flat().map(ph=>ph.id)));for(const p of rows.filter(p=>p.importId===batchId)){for(const ph of Object.values(p.photos||{}).flat())if(!keep.has(ph.id)){const assets=tx.objectStore('assets');assets.delete(ph.id);assets.delete('thumb256:'+ph.id);if(ph.fileId)assets.delete('thumb256:'+ph.fileId);}store.delete(p.id);}tx.objectStore('imports').delete(batchId);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}

// Read and merge in one transaction so a draft edited during the network request wins.
export async function mergeCloudProducts(rows,merge,preserveId,canDelete){
 const connection=await ready;return new Promise((resolve,reject)=>{
  const tx=connection.transaction('products','readwrite'),store=tx.objectStore('products'),remoteIds=new Set(rows.map(r=>r.id));let updated=0;
  const removable=typeof canDelete==='function'?canDelete:local=>local.importSynced&&!local.demo&&!local.dirty;
  const allReq=store.getAll();
  allReq.onsuccess=()=>{
   try{
    const localMap=new Map(allReq.result.map(x=>[x.id,x]));
    for(const local of allReq.result){
     if(!local.demo&&local.id!==preserveId&&!remoteIds.has(local.id)&&removable(local)){store.delete(local.id);updated++;}
    }
    for(const remote of rows){
     const local=localMap.get(remote.id);
     if(local&&local.id===preserveId)continue;
     const result=merge(local,remote);
     if(JSON.stringify(local)===JSON.stringify(result))continue;
     store.put(result);updated++;
    }
   }catch(e){reject(e);tx.abort();}
  };
  tx.oncomplete=()=>resolve(updated);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('บันทึกข้อมูลที่รีเฟรชไม่สำเร็จ'));
 });
}
