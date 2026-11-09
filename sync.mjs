// Reconcile cloud revisions without allowing an untouched import draft to hide them.
function clean(value){
 if(value===null||value===undefined||value==='')return undefined;
 if(Array.isArray(value))return value.map(clean);
 if(typeof value==='object'){const entries=Object.keys(value).sort().map(k=>[k,clean(value[k])]).filter(([,v])=>v!==undefined&&!(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length));return Object.fromEntries(entries);}
 return value;
}
export function productContent(p){
 const photos=Object.fromEntries(Object.entries(p.photos||{}).filter(([,a])=>a.length).map(([angle,list])=>[angle,list.map(ph=>ph.id||ph.fileId)]));
 return JSON.stringify(clean({fields:p.fields||{},dimensions:p.dimensions||{},purpose:p.purpose||'',photos}));
}
export function hasLocalEdits(local,remote,revisions=[]){
 if(!local?.dirty)return false;
 if(local.newRevision)return true;
 if(local.baseRevision){
  const base=revisions.find(r=>r[0]===local.baseRevision);
  if(!base)return true; // Unknown history is never permission to discard a draft.
  const meta=JSON.parse(base[4]||'{}');
  return productContent(local)!==productContent({fields:meta.fields||{},dimensions:meta.dimensions||{},purpose:meta.purpose??remote.purpose,photos:JSON.parse(base[5]||'{}')});
 }
 // Imported jobs used to be marked dirty even before any photography or edits.
 const fields={...local.fields};delete fields.photographer;
 return productContent({...local,fields})!==productContent({fields:{},dimensions:{},photos:{},purpose:remote.purpose});
}
export function reconcileProduct(local,remote,revisions=[]){
 if(!local)return remote;
 // A response started before a save must not roll that newer save back.
 if(local.sheetId&&local.sheetId!==remote.sheetId)throw Error('ข้อมูลในเครื่องมาจากคนละชีต กรุณาตรวจการเชื่อมต่อ');
 if((Date.parse(local.syncedAt)||0)>(Date.parse(remote.syncedAt)||0))return local;
 if(!local.newRevision&&productContent(local)===productContent(remote))return remote;
 if(!hasLocalEdits(local,remote,revisions))return remote;
 const changed=(local.baseRevision||null)!==(remote.baseRevision||null);
 return {...local,importSynced:true,sheetId:remote.sheetId,remoteUpdate:changed?remote:null};
}
export function singleFlight(task){
 let pending;
 return (...args)=>{if(pending)return pending;pending=Promise.resolve().then(()=>task(...args));const active=pending;active.then(()=>{if(pending===active)pending=null;},()=>{if(pending===active)pending=null;});return active;};
}
