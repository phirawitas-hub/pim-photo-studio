import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {reconcileProduct,productContent,singleFlight} from '../sync.mjs';
const remote={id:'p',code:'1C007056R0090 BK0000',purpose:'Request',fields:{photographer:'A'},dimensions:{},photos:{top:[{id:'a',fileId:'drive-a'}]},baseRevision:'r1',syncedAt:'2026-11-09T10:00:00Z',dirty:false,sheetId:'sheet',importSynced:true};
const revision=p=>[p.baseRevision,p.id,p.syncedAt,'false',JSON.stringify({fields:p.fields,dimensions:p.dimensions,purpose:p.purpose}),JSON.stringify(p.photos)];
test('another device replaces legacy empty dirty import with the saved cloud pictures',()=>{
 const local={id:'p',purpose:'Request',photos:{top:[]},fields:{photographer:'Manager'},dimensions:{},dirty:true};
 const got=reconcileProduct(local,remote,[revision(remote)]);assert.deepEqual(got,remote);assert.equal(got.dirty,false);assert.equal(got.photos.top[0].fileId,'drive-a');
});
test('a dirty flag alone cannot hide a newer cloud revision',()=>{
 const old={...remote,baseRevision:'old',photos:{top:[{id:'old',fileId:'old'}]},syncedAt:'2026-11-08T10:00:00Z'};
 assert.deepEqual(reconcileProduct({...old,dirty:true},remote,[revision(old),revision(remote)]),remote);
});
test('unsaved new photos survive and expose the remote version separately',()=>{
 const local={...remote,baseRevision:null,syncedAt:null,dirty:true,photos:{left:[{id:'local-original'}]}};
 const got=reconcileProduct(local,remote);assert.equal(got.photos.left[0].id,'local-original');assert.deepEqual(got.remoteUpdate,remote);assert.equal(got.dirty,true);
});
test('removing every old photo is a real edit, not an untouched import',()=>{
 const local={...remote,photos:{},dirty:true},newer={...remote,baseRevision:'r2',syncedAt:'2026-11-09T11:00:00Z'};
 const got=reconcileProduct(local,newer,[revision(remote),revision(newer)]);assert.deepEqual(got.photos,{});assert.deepEqual(got.remoteUpdate,newer);
});
test('metadata, dimension zero and explicitly new revision are preserved',()=>{
 for(const change of [{fields:{photographer:'A',remark:'new'}},{dimensions:{physical:{width:0}}},{newRevision:true,photos:{}}]){
  const local={...remote,...change,dirty:true};assert.equal(reconcileProduct(local,remote,[revision(remote)]).dirty,true);
 }
});
test('a saved pending revision is acknowledged instead of kept as a conflicting draft',()=>{
 assert.deepEqual(reconcileProduct({...remote,baseRevision:'r0',pendingRevision:'r1',dirty:true},remote),remote);
});
test('derived Drive upload IDs and empty controls do not count as content edits',()=>{
 assert.equal(productContent({...remote,fields:{photographer:'A',remark:''},dimensions:{physical:{width:''}},photos:{top:[{id:'a'}],left:[]}}),productContent(remote));
});
test('an older in-flight snapshot cannot roll back a newer completed local save',()=>{
 const newer={...remote,baseRevision:'r2',syncedAt:'2026-11-09T11:00:00Z'};assert.deepEqual(reconcileProduct(newer,remote),newer);
});
test('unknown revision history and a different workspace fail safely',()=>{
 const local={...remote,baseRevision:'missing',photos:{},dirty:true};assert.equal(reconcileProduct(local,remote).dirty,true);
 assert.throws(()=>reconcileProduct({...local,sheetId:'other'},remote),/คนละชีต/);
});
test('simultaneous manual and automatic refresh share a result and recover after failure',async()=>{
 let release,calls=0;const pull=singleFlight(()=>{calls++;return new Promise(r=>release=r);});const first=pull(),second=pull();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);release('fresh');assert.equal(await second,'fresh');
 let fail=true;const retry=singleFlight(()=>{if(fail)throw Error('offline');return 'back';});await assert.rejects(retry(),/offline/);fail=false;assert.equal(await retry(),'back');
});
const app=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
function refreshFixture(){
 let remoteRows=[remote],failed=false,redraw=0,reads=0;const saved=new Map(),local=new Map([['p',{id:'p',purpose:'Request',photos:{},fields:{photographer:'Manager'},dirty:true}]]);
 const ctx=vm.createContext({singleFlight,reconcileProduct,Date,JSON,console,syncing:false,syncError:'',lastRefreshAttempt:0,lastSync:'old-time',workspace:{},batches:[],products:[],current:null,modal:{open:false},document:{activeElement:{tagName:'SELECT'}},location:{hash:'#products'},settings:{},syncResult:null,query:'',batchFilter:'',importFrom:'',importTo:'',filter:'all',brand:{},fmtDate:x=>x,stamp:()=> 'now',toast:()=>{},applyBranding:()=>{},updateConnection:()=>{},$:s=>s==='#table-area'?{}:null,cloud:{connected:()=>true,snapshot:async()=>{reads++;if(failed)throw Error('offline');return {imports:[],revisions:[revision(remote)],at:'new-time',options:[],data:[],stock:{}};},loadProducts:async()=>remoteRows},db:{put:async(t,v)=>saved.set(t+':'+v.id,v),mergeCloudProducts:async(rows,merge,preserve)=>{let n=0;for(const r of rows){if(r.id!==preserve){local.set(r.id,merge(local.get(r.id),r));n++;}}return n;}},reloadLocal:async()=>{ctx.products=[...local.values()];},route:async()=>{throw Error('must update list without replacing focused filter');}});
 vm.runInContext(app.slice(app.indexOf('const pullCloud=singleFlight('),app.indexOf('function openImport()')),ctx);
 ctx.updateSyncStatus=()=>{};ctx.refreshProductView=()=>{redraw++;};
 return {ctx,local,saved,fail:()=>failed=true,get reads(){return reads;},get redraw(){return redraw;}};
}
test('refresh redraws actual cloud photos even when the file filter remains focused',async()=>{
 const b=refreshFixture();await b.ctx.refreshCloud(true);assert.equal(b.local.get('p').photos.top[0].fileId,'drive-a');assert.equal(b.redraw,1);assert.equal(b.ctx.lastSync,'new-time');assert.equal(b.ctx.syncResult.total,1);
});
test('failed refresh keeps last successful time and cached data and exposes the failure',async()=>{
 const b=refreshFixture();b.fail();await assert.rejects(b.ctx.refreshCloud(true),/offline/);assert.equal(b.ctx.lastSync,'old-time');assert.equal(b.ctx.syncError,'offline');assert.equal(b.saved.size,0);assert.equal(b.ctx.syncing,false);
});
test('manual refresh waits for an active auto refresh instead of claiming a disconnected state',async()=>{
 const b=refreshFixture();await Promise.all([b.ctx.refreshCloud(true),b.ctx.refreshCloud()]);assert.equal(b.reads,1);assert.equal(b.ctx.lastSync,'new-time');
});
