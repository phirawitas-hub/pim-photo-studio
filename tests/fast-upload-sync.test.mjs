import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {optimizePhoto} from '../photo-optimize.mjs';
import {reconcileProduct,hasLocalEdits,singleFlight} from '../sync.mjs';
import {productScopeKey,normalizeInventoryStatus} from '../import-check.mjs';

const googleSource=await readFile(new URL('../google.mjs',import.meta.url),'utf8');
const backendCode=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const appCode=await readFile(new URL('../app.mjs',import.meta.url),'utf8');

test('optimizePhoto downscales oversized images to JPEG, skips small images, falls back if larger, and rejects broken files',async()=>{
 const bigFile={name:'IMG_1234.PNG',size:4*1024*1024,type:'image/png'};
 let drawn=[],closed=0;
 const makeDoc=(outSize)=>({
  createElement:()=>({
   width:0,height:0,
   getContext:()=>({fillStyle:'',fillRect:()=>{},drawImage:(_,dx,dy,dw,dh)=>drawn.push([dw,dh])}),
   toBlob:(cb,mime,q)=>cb({size:outSize,type:mime,quality:q})
  })
 });
 const optimized=await optimizePhoto(bigFile,{
  createImageBitmapFn:async()=>({width:4000,height:3000,close(){closed++;}}),
  documentObj:makeDoc(240*1024)
 });
 assert.equal(optimized.optimized,true);
 assert.equal(optimized.name,'IMG_1234.jpg');
 assert.equal(optimized.size,240*1024);
 assert.deepEqual(drawn,[[1600,1200]]);
 assert.equal(closed,1);

 const smallFile={name:'small.jpg',size:180*1024,type:'image/jpeg'};
 const skipped=await optimizePhoto(smallFile,{
  createImageBitmapFn:async()=>({width:1200,height:900,close(){}}),
  documentObj:makeDoc(100*1024)
 });
 assert.equal(skipped.optimized,false);
 assert.equal(skipped.blob,smallFile);

 const fallback=await optimizePhoto(bigFile,{
  createImageBitmapFn:async()=>({width:3200,height:2400,close(){}}),
  documentObj:makeDoc(5*1024*1024)
 });
 assert.equal(fallback.optimized,false);
 assert.equal(fallback.blob,bigFile);

 await assert.rejects(
  optimizePhoto(bigFile,{createImageBitmapFn:async()=>{throw Error('decode failed');}}),
  /อ่านรูปไม่ได้/
 );
});

test('google.mjs uploads photos concurrently via markPhotoUploaded, preserves succeeded IDs on failure, and retries lock contention',async()=>{
 const rows=new Map(),assets=new Map();
 let activeUploads=0,maxActive=0,markCalls=0;
 const ctx=vm.createContext({
  ANGLES:[{id:'top'},{id:'under'},{id:'left'},{id:'right'},{id:'inner'}],
  Set,Map,Promise,Math,Error,Date,Array,Object,JSON,Number,String,Boolean,
  setTimeout:(fn)=>fn(),clearTimeout:()=>{},
  db:{
   get:async(t,id)=>structuredClone((t==='assets'?assets:rows).get(id)),
   put:async(t,v)=>(t==='assets'?assets:rows).set(v.id,structuredClone(v)),
   markPhotoUploaded:async(pid,photoId,fileId)=>{
    markCalls++;
    const p=rows.get(pid);
    for(const list of Object.values(p.photos||{}))for(const ph of list)if(ph.id===photoId)ph.fileId=fileId;
   },
   all:async()=>[]
  },
  console
 });
 vm.runInContext(googleSource.replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 vm.runInContext("config={sheetId:'sheet'}",ctx);

 const p={id:'prod-1',code:'SKU1',photos:{
  top:[{id:'p1',name:'1.jpg'}],
  under:[{id:'p2',name:'2.jpg'}],
  left:[{id:'p3',name:'3.jpg'}],
  right:[{id:'p4',name:'4.jpg'}],
  inner:[{id:'p5',name:'5.jpg'}]
 }};
 rows.set(p.id,structuredClone(p));
 for(const id of ['p1','p2','p3','p4','p5'])assets.set(id,{id,blob:{type:'image/jpeg'}});

 ctx.upload=async(_,meta)=>{
  activeUploads++;
  maxActive=Math.max(maxActive,activeUploads);
  await new Promise(r=>setImmediate(r));
  activeUploads--;
  if(meta.key==='photo-p3')throw Error('temporary upload error');
  return 'drv-'+meta.key;
 };
 await assert.rejects(ctx.uploadProductPhotos(p,()=>{},3),/temporary upload error/);
 assert.equal(maxActive,3);
 assert.ok(markCalls>=2);
 assert.equal(assets.get('p1').fileId,'drv-photo-p1');
 assert.equal(assets.get('p2').fileId,'drv-photo-p2');
 assert.equal(assets.get('p3').fileId,undefined);

 // Retries server LockService contention on retryable actions, never on CONNECTION errors.
 let rpcCalls=0;
 ctx.rpcOnce=async(action)=>{
  rpcCalls++;
  if(rpcCalls<3)throw Error('มีงานบันทึกอยู่ กรุณาลองใหม่');
  return 'ok-'+action;
 };
 assert.equal(await ctx.rpc('revision',{}),'ok-revision');
 assert.equal(rpcCalls,3);

 let connCalls=0;
 ctx.rpcOnce=async()=>{connCalls++;throw Object.assign(Error('lost'),{code:'CONNECTION'});};
 await assert.rejects(ctx.rpc('upload',{}),/lost/);
 assert.equal(connCalls,1);
});

test('google.mjs loadProducts falls back cleanly when a selection points to a missing revision',async()=>{
 const ctx=vm.createContext({productScopeKey,normalizeInventoryStatus,Set,Map,Object,Array,JSON,String,Boolean,Date});
 vm.runInContext(googleSource.replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 vm.runInContext("config={sheetId:'sheet-1'}",ctx);
 const loaded=await ctx.loadProducts({
  imports:[['b1']],
  products:[['p1','SKU1','Item','','b1','Form','9','2026-11-26T00:00:00Z','VP','A','Good','5']],
  revisions:[['r1','p1','2026-11-26T01:00:00Z','TRUE',JSON.stringify({fields:{photographer:'A'}}),JSON.stringify({top:[{fileId:'f1'}]})]],
  selections:[['p1','missing-rev','2026-11-26T02:00:00Z']]
 });
 assert.equal(loaded[0].baseRevision,'r1');
 assert.equal(loaded[0].photos.top[0].fileId,'f1');
 assert.equal(loaded[0].syncedAt,'2026-11-26T01:00:00Z');
});

test('sync.mjs handles purpose whitespace, older photographer-only edits, truncated compact revisions, and closed propagation',()=>{
 const remote={id:'p',code:'SKU1',purpose:'Request ',fields:{photographer:'B'},dimensions:{},photos:{top:[{id:'a',fileId:'drv-a'}]},baseRevision:'r2',syncedAt:'2026-11-26T10:00:00Z',dirty:false,sheetId:'s',importSynced:true,closed:false};
 const rev1=['r1','p','2026-11-26T09:00:00Z','false',JSON.stringify({fields:{photographer:'A'},dimensions:{},purpose:'Request'}),JSON.stringify({top:[{id:'old',fileId:'drv-old'}]})];
 const rev2=['r2','p','2026-11-26T10:00:00Z','true',JSON.stringify({fields:{photographer:'B'},dimensions:{},purpose:'Request'}),JSON.stringify(remote.photos)];

 // Untouched local import with minor purpose difference accepts remote.
 const untouched={id:'p',code:'SKU1',purpose:'Request',fields:{photographer:'LocalUser'},dimensions:{},photos:{},dirty:true};
 assert.equal(hasLocalEdits(untouched,remote,[rev1,rev2]),false);
 assert.deepEqual(reconcileProduct(untouched,remote,[rev1,rev2]),remote);

 // Changing only photographer on an older baseRevision does not hide newer cloud revision.
 const onlyPhotographer={id:'p',code:'SKU1',purpose:'Request',fields:{photographer:'SomeoneElse'},dimensions:{},photos:{top:[{id:'old',fileId:'drv-old'}]},baseRevision:'r1',syncedAt:'2026-11-26T09:00:00Z',dirty:true,sheetId:'s'};
 assert.equal(hasLocalEdits(onlyPhotographer,remote,[rev1,rev2]),false);
 assert.deepEqual(reconcileProduct(onlyPhotographer,remote,[rev1,rev2]),remote);

 // Truncated compact-snapshot revision (length < 6) safely preserves draft rather than discarding it.
 assert.equal(hasLocalEdits(onlyPhotographer,remote,[['r1','p','2026-11-26T09:00:00Z'],rev2]),true);

 // Deliberate photographer edit on the SAME baseRevision is kept, and remote.closed propagates.
 const sameBase={...remote,fields:{photographer:'Edited'},dirty:true};
 assert.equal(hasLocalEdits(sameBase,remote,[rev1,rev2]),true);
 assert.equal(reconcileProduct(sameBase,{...remote,closed:true},[rev1,rev2]).closed,true);
});

test('Apps Script upload runs DriveApp.createFile without ScriptLock, caches folders/schema, enforces closed jobs, and handles same-key races',()=>{
 const events=[],tables=new Map([
  ['PIM_Products',[['p1','SKU1','Item','','b1','Form','9','2026-11-26T00:00:00Z','VP','A','Good','5'],['p-closed','SKU2','Closed','','b1','Form','10','2026-11-26T00:00:00Z','VP','B','Good','1']]],
  ['PIM_Imports',[['b1','req.xlsx','2026-11-26T00:00:00Z','drv0','Form','2']]],
  ['PIM_Files',[]],
  ['PIM_Deletions',[]],
  ['PIM_ClosedJobs',[['p-closed','2026-11-26T00:00:00Z']]]
 ]);
 const cacheStore=new Map();
 let lockHeld=false,fileSeq=0,trashedIds=[],folderCreates=0,schemaCalls=0;
 const folderMap=new Map();
 const makeFolder=(id)=>{
  const subs=new Map(),files=new Map();
  const folder={
   getId:()=>id,isTrashed:()=>false,
   getFoldersByName:n=>{const f=subs.get(n);return {hasNext:()=>!!f,next:()=>f};},
   createFolder:n=>{folderCreates++;const f=makeFolder('dir-'+(++fileSeq));subs.set(n,f);return f;},
   getFilesByName:n=>{const f=files.get(n);return {hasNext:()=>!!f,next:()=>f};},
   createFile:blob=>{
    events.push({op:'createFile',lockHeld});
    const fid='file-'+(++fileSeq);
    const f={getId:()=>fid,setTrashed:v=>{if(v)trashedIds.push(fid);}};
    files.set(blob.name,f);
    return f;
   }
  };
  folderMap.set(id,folder);
  return folder;
 };
 const rootFolder=makeFolder('root');
 const ctx=vm.createContext({
  console,Date,Set,Map,Math,Array,Object,JSON,String,Number,Boolean,
  CacheService:{getScriptCache:()=>({get:k=>cacheStore.get(k)||null,put:(k,v)=>cacheStore.set(k,v)})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet-123456'}),getUserProperties:()=>({getProperty:()=>'root',setProperty:()=>{}})},
  LockService:{getScriptLock:()=>({tryLock:()=>{lockHeld=true;events.push({op:'lock'});return true;},releaseLock:()=>{lockHeld=false;events.push({op:'unlock'});}})},
  Utilities:{
   base64Decode:s=>[0xff,0xd8,0xff,0xe0,1,2,3],
   newBlob:(bytes,mime,name)=>({bytes,mime,name}),
   computeDigest:(_,s)=>Array.from(s).map(c=>c.charCodeAt(0)%128),
   base64EncodeWebSafe:a=>Buffer.from(a).toString('base64url'),
   DigestAlgorithm:{MD5:'MD5'}
  },
  DriveApp:{getFolderById:id=>folderMap.get(id)},
  SpreadsheetApp:{openById:()=>({getId:()=>'test-sheet-123456',getName:()=>'Test',getSheetByName:()=>({name:'sheet'})}),flush(){}}
 });
 vm.runInContext(backendCode,ctx);
 ctx.schema_=()=>{schemaCalls++;};
 ctx.table_=(_,name)=>tables.get(name)||[];
 ctx.append_=(_,name,rows)=>{events.push({op:'append',name,lockHeld});tables.set(name,[...(tables.get(name)||[]),...rows.map(r=>r.map(String))]);};

 // Upload creates Drive file with lockHeld === false, then briefly acquires lock for PIM_Files append.
 const id1=ctx.pimCall({sheetId:'test-sheet-123456',action:'upload',payload:{key:'photo-1',kind:'photo',productId:'p1',angle:'top',mime:'image/jpeg',name:'a.jpg',base64:'/9j/4AAQ'}});
 assert.equal(id1,'file-3');
 assert.equal(events.find(e=>e.op==='createFile').lockHeld,false);
 assert.equal(events.find(e=>e.op==='append').lockHeld,true);
 assert.equal(lockHeld,false);
 assert.equal(schemaCalls,1);

 // Closed job upload is rejected before creating a Drive file.
 assert.throws(()=>ctx.pimCall({sheetId:'test-sheet-123456',action:'upload',payload:{key:'photo-closed',kind:'photo',productId:'p-closed',angle:'top',mime:'image/jpeg',name:'x.jpg',base64:'/9j/4AAQ'}}),/ปิดแล้ว/);

 // Second upload reuses cached schema and cached folder without creating folders.
 const prevCreates=folderCreates;
 ctx.pimCall({sheetId:'test-sheet-123456',action:'upload',payload:{key:'photo-2',kind:'photo',productId:'p1',angle:'top',mime:'image/jpeg',name:'b.jpg',base64:'/9j/4AAQ'}});
 assert.equal(schemaCalls,1);
 assert.equal(folderCreates,prevCreates);

 // Concurrent same-key race trashes duplicate file and returns existing ID.
 const origTable=ctx.table_;
 let checks=0;
 ctx.table_=(ss,name)=>{
  if(name==='PIM_Files'){checks++;if(checks>=2)return [['photo-race','existing-drv','photo','p1','top','7','image/jpeg']];}
  return origTable(ss,name);
 };
 const raceId=ctx.pimCall({sheetId:'test-sheet-123456',action:'upload',payload:{key:'photo-race',kind:'photo',productId:'p1',angle:'top',mime:'image/jpeg',name:'c.jpg',base64:'/9j/4AAQ'}});
 assert.equal(raceId,'existing-drv');
 assert.equal(trashedIds.length,1);
 assert.equal(lockHeld,false);
});

test('Apps Script listSnapshot reads deleted batches out safely and selectRevision flushes before writeData',()=>{
 const tables=new Map([
  ['PIM_Imports',[['b1','req.xlsx','2026-11-26T00:00:00Z','drv','Form','1'],['b-del','del.xlsx']]],
  ['PIM_Products',[['p1','001','Item','','b1','Form','9','2026-11-26T00:00:00Z','VP','A','Good','5'],['p-del','002','Del','','b-del']]],
  ['PIM_Revisions',[['r1','p1','2026-11-26T01:00:00Z','true','{}','{}']]],
  ['PIM_Selections',[]],
  ['PIM_Deletions',[['b-del','2026-11-26T01:00:00Z','del.xlsx','{}','pending']]],
  ['PIM_ClosedJobs',[]],
  ['PIM_Options',[]],
  ['PIM_Branding',[]]
 ]);
 const order=[];
 const ss={
  getId:()=>'test-sheet-123456',getName:()=>'Test',
  getSheetByName:()=>null
 };
 const ctx=vm.createContext({
  console,Date,Set,Map,
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(_,s)=>s,base64Encode:s=>s},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet-123456'})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>ss,flush:()=>order.push('flush')}
 });
 vm.runInContext(backendCode,ctx);
 ctx.schema_=()=>{};
 ctx.table_=(_,name)=>tables.get(name)||[];
 ctx.append_=(_,name,rows)=>{order.push('append:'+name);tables.set(name,[...(tables.get(name)||[]),...rows.map(r=>r.map(String))]);};
 ctx.writeData_=()=>{order.push('writeData');};

 const snap=ctx.pimCall({sheetId:'test-sheet-123456',action:'snapshot',payload:{compact:true,bases:[]}});
 assert.equal(snap.parts.products.length,1);
 assert.equal(snap.parts.products[0][0],'p1');

 ctx.pimCall({sheetId:'test-sheet-123456',action:'selectRevision',payload:{productId:'p1',revisionId:'r1'}});
 assert.deepEqual(order,['append:PIM_Selections','flush','writeData']);
});

test('pullCloud loads bases after reloadLocal, handles splitPendingStock race, removes deleted cloud jobs, and caches legacyStock',async()=>{
 let snapCalls=0,legacyStockCalls=0;
 const receivedBases=[];
 const local=new Map([
  ['old-removed',{id:'old-removed',code:'X',importId:'b1',purpose:'Req',fields:{photographer:'Staff'},dimensions:{},photos:{},dirty:true,importSynced:true}],
  ['legacy-done',{id:'legacy-done',code:'LEG-1',importId:'b1',purpose:'Req',fields:{photographer:'A'},dimensions:{},photos:{top:[{id:'a',fileId:'f1'}]},baseRevision:'rev-leg',dirty:true,importSynced:true,stockCompany:'',stockLocation:'',stockStatus:''}],
  ['wait-1',{id:'wait-1',code:'800353',importId:'b1',purpose:'Req',fields:{},dimensions:{},photos:{},dirty:false,importSynced:true,stockCompany:'',stockLocation:'',stockStatus:'',stockQty:''}]
 ]);
 const splitRows=[
  {id:'legacy-done',code:'LEG-1',importId:'b1',purpose:'Req',fields:{photographer:'A'},dimensions:{},photos:{top:[{id:'a',fileId:'f1'}]},baseRevision:'rev-leg',syncedAt:'2026-11-26T00:00:00Z',dirty:false,sheetId:'sheet',importSynced:true,stockCompany:'',stockLocation:'',stockStatus:''},
  {id:'wait-1',code:'800353',importId:'b1',purpose:'Req',fields:{},dimensions:{},photos:{},baseRevision:null,syncedAt:null,dirty:false,sheetId:'sheet',importSynced:true,stockCompany:'VP',stockLocation:'A',stockStatus:'Good',stockQty:'10'},
  {id:'wait-2',code:'800353',importId:'b1',purpose:'Req',fields:{},dimensions:{},photos:{},baseRevision:null,syncedAt:null,dirty:false,sheetId:'sheet',importSynced:true,stockCompany:'VP',stockLocation:'B',stockStatus:'Damage',stockQty:'2'}
 ];
 const ctx=vm.createContext({
  singleFlight,reconcileProduct,hasLocalEdits,Date,JSON,Set,Map,String,Object,Array,Number,Boolean,console,
  syncing:false,syncError:'',lastRefreshAttempt:0,lastSync:'',workspace:{},batches:[],products:[],current:null,modal:{open:false},
  document:{activeElement:{tagName:'BODY'}},location:{hash:'#products'},settings:{},syncResult:null,query:'',batchFilter:'',stockStatusFilter:'',importFrom:'',importTo:'',filter:'all',brand:{},
  fmtDate:x=>x,stamp:()=>'now',toast:()=>{},applyBranding:()=>{},updateConnection:()=>{},$:()=>null,
  cloud:{
   connected:()=>true,
   clearSnapshotCache:()=>{},
   snapshot:async(bases)=>{
    receivedBases.push(bases);
    snapCalls++;
    return {
     imports:[['b1','req.xlsx','2026-11-26','drv','Form','3']],
     revisions:[['rev-leg','legacy-done','2026-11-26T00:00:00Z','true',JSON.stringify({fields:{photographer:'A'},purpose:'Req'}),JSON.stringify({top:[{id:'a',fileId:'f1'}]})]],
     legacyCodes:['LEG-1'],
     at:'t'+snapCalls,options:[],data:[],
     stock:{rows:[],warnings:[]}
    };
   },
   loadProducts:async()=>snapCalls>1?splitRows:[splitRows[0],{...splitRows[1],stockCompany:'',stockLocation:'',stockStatus:''}],
   legacyStock:async()=>{legacyStockCalls++;return {rows:[{code:'LEG-1',company:'VP',location:'A',status:'Good',qty:'1'},{code:'800353',company:'VP',location:'A',status:'Good',qty:'10'}],warnings:[],checkedAt:'t-stock'};},
   splitPendingStock:async()=>({split:0,created:0})
  },
  db:{
   put:async()=>{},
   remove:async()=>{},
   mergeCloudProducts:async(rows,merge,preserveId,canDelete)=>{
    const remoteIds=new Set(rows.map(r=>r.id));
    for(const [id,item] of [...local.entries()])if(id!==preserveId&&!remoteIds.has(id)&&canDelete(item))local.delete(id);
    for(const r of rows)if(r.id!==preserveId)local.set(r.id,merge(local.get(r.id),r));
    return rows.length;
   }
  },
  reloadLocal:async()=>{ctx.products=[...local.values()];},
  route:async()=>{}
 });
 vm.runInContext(appCode.slice(appCode.indexOf('const pullCloud=singleFlight('),appCode.indexOf('function openImport()')),ctx);
 ctx.updateSyncStatus=()=>{};ctx.refreshProductView=()=>{};

 // First pull: loads bases after reloadLocal, scans legacyStock once, re-fetches after splitPendingStock race, deletes old-removed.
 await ctx.refreshCloud(true);
 assert.deepEqual(Array.from(receivedBases[0]),['rev-leg']);
 assert.equal(snapCalls,2);
 assert.equal(legacyStockCalls,1);
 assert.equal(local.has('old-removed'),false);
 assert.equal(local.has('wait-2'),true);

 // Second pull: legacyKey cached & no unsplit legacy rows -> does NOT re-scan 65k stock sheet!
 await ctx.refreshCloud(true);
 assert.equal(legacyStockCalls,1);
});
