const ready=new Promise((resolve,reject)=>{const request=indexedDB.open('pim-photo-studio-v1',1);request.onupgradeneeded=()=>{for(const name of ['products','imports','assets','settings'])request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function action(name,mode,operation){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);const r=operation(tx.objectStore(name));let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('พื้นที่เก็บข้อมูลไม่พอ'));});}
export const get=(name,id)=>action(name,'readonly',s=>s.get(id));
export const all=name=>action(name,'readonly',s=>s.getAll());
export const put=(name,value)=>action(name,'readwrite',s=>s.put(value));
export const remove=(name,id)=>action(name,'readwrite',s=>s.delete(id));
export async function commitImport(batch,products){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(['imports','products'],'readwrite');tx.objectStore('imports').put(batch);for(const p of products)tx.objectStore('products').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
