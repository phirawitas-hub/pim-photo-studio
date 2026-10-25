import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
function backend(){
 const tables=new Map(),writes=[],locks={taken:0,released:0};
 const ctx=vm.createContext({console,Date,Set,Map,LockService:{getScriptLock:()=>({tryLock:()=>{locks.taken++;return true;},releaseLock:()=>locks.released++})},SpreadsheetApp:{openById:()=>({getId:()=> 'test-sheet-123456',getName:()=> 'Test'})}});
 vm.runInContext(code,ctx);
 // Replace storage boundary only: validation, idempotency and locking remain real.
 ctx.writeData_=()=>{};ctx.schema_=()=>{};ctx.table_=(_,name)=>tables.get(name)||[];
 ctx.append_=(_,name,rows)=>{writes.push({name,rows});tables.set(name,[...(tables.get(name)||[]),...rows.map(r=>r.map(String))]);};
 const call=(action,payload)=>ctx.pimCall({sheetId:'test-sheet-123456',action,payload});
 return {ctx,tables,writes,locks,call};
}
function productFixture(b){
 b.tables.set('PIM_Products',[['p1','SKU1','Test','','batch1']]);b.tables.set('PIM_Imports',[['batch1']]);
 b.tables.set('PIM_Files',Array.from({length:6},(_,i)=>['key'+i,'f'+i,'photo','p1','top','1','image/jpeg']));
}
test('Apps Script rejects unlisted actions and always releases its write lock',()=>{
 const b=backend();assert.throws(()=>b.call('deleteAll',{}),/ไม่รองรับ/);assert.equal(b.locks.taken,0);
 assert.throws(()=>b.call('revision',{id:'r1',productId:'missing'}),/กรุณาบันทึก/);assert.equal(b.locks.taken,b.locks.released);
});
test('revision validates limits, image ownership and concurrent base before writing',()=>{
 const b=backend();productFixture(b);
 assert.throws(()=>b.call('revision',{id:'r1',productId:'p1',photos:{top:Array.from({length:6},(_,i)=>({fileId:'f'+i}))}}),/ไม่เกิน 5/);
 assert.throws(()=>b.call('revision',{id:'r1',productId:'p1',photos:{left:[{fileId:'f0'}]}}),/ไม่ตรง/);
 b.tables.set('PIM_Revisions',[['other','p1','2026-10-22']]);
 assert.throws(()=>b.call('revision',{id:'r1',productId:'p1',baseRevision:null,photos:{}}),/เวอร์ชันใหม่/);
 assert.equal(b.writes.length,0);assert.equal(b.locks.taken,b.locks.released);
});
test('a retried revision returns its existing result without a duplicate write',()=>{
 const b=backend();productFixture(b);b.ctx.SpreadsheetApp.flush=()=>{};
 const payload={id:'revision1',productId:'p1',baseRevision:null,photos:{top:[{fileId:'f0'}]},meta:{purpose:'Test',fields:{photographer:'QA'}}};
 const first=b.call('revision',payload),again=b.call('revision',payload);
 assert.equal(first.id,again.id);assert.equal(first.at,again.at);assert.equal(b.writes.filter(w=>w.name==='PIM_Revisions').length,1);assert.equal(b.writes.filter(w=>w.name==='PIM_Selections').length,1);assert.equal(b.writes[0].rows[0][3],false);
});
test('source parts are idempotent and formula-like strings are escaped before SpreadsheetApp',()=>{
 const b=backend();b.call('sourceMeta',{batchId:'batch1',part:1,text:'{"formula":"=SUM(A1)"}'});b.call('sourceMeta',{batchId:'batch1',part:1,text:'{"formula":"=SUM(A1)"}'});
 assert.equal(b.writes.length,1);assert.equal(b.ctx.raw_('=IMPORTXML("x")'),"'=IMPORTXML(\"x\")");assert.equal(b.ctx.raw_("'leading quote"),"''leading quote");assert.equal(b.ctx.raw_('00123'),"'00123");assert.equal(b.ctx.raw_(42),42);
});

test('same item across imports reuses immutable revision, permits shared photos and rejects a different item',()=>{
 const b=backend();productFixture(b);b.ctx.SpreadsheetApp.flush=()=>{};
 b.tables.get('PIM_Products').push(['p2','SKU1','New request','','batch1'],['p3','OTHER','Other','','batch1']);
 const first=b.call('revision',{id:'r1',productId:'p1',meta:{fields:{photographer:'A'}},photos:{top:[{fileId:'f0'}]}});
 b.call('selectRevision',{productId:'p2',revisionId:'r1'});
 assert.equal(b.tables.get('PIM_Revisions').length,1);
 assert.throws(()=>b.call('selectRevision',{productId:'p3',revisionId:'r1'}),/Item Code/);
 const next=b.call('revision',{id:'r2',productId:'p2',baseRevision:'r1',meta:{fields:{photographer:'B'}},photos:{top:[{fileId:'f0'}]}});
 assert.equal(next.number,2);assert.equal(JSON.parse(b.tables.get('PIM_Revisions')[0][4]).fields.photographer,'A');
 b.call('selectRevision',{productId:'p2',revisionId:'r1'});
 assert.equal(b.tables.get('PIM_Selections').at(-1)[1],'r1');
 assert.throws(()=>b.call('revision',{id:'r3',productId:'p1',baseRevision:'r1',meta:{fields:{photographer:'A'}},photos:{}}),/เวอร์ชันใหม่/);
});
test('stock matches complete item codes, preserves leading zero and separates companies and statuses',()=>{
 const b=backend();const data=[['Location','Item Code','Description','Inventory\nStatus','Categories ','SUM ของ On Hand\nQty'],['A','001','Part','Good','SPARE PART','0'],['B','001','Part','Hold','SPARE PART','2'],['C','1','Other','Good','SPARE PART','99']];
 const ss={getSheetByName:()=>({getLastRow:()=>data.length,getDataRange:()=>({getDisplayValues:()=>data})})};
 const result=b.ctx.stock_(ss,' 001 ');assert.equal(result.rows.length,4);assert.equal(result.rows[0].qty,'0');assert.equal(result.rows[2].company,'VSP');assert.equal(result.rows[1].status,'Hold');
});

test('Google bridge rejects untrusted origins and only answers the trusted parent',()=>{
 const b=backend();let html='';b.ctx.HtmlService={XFrameOptionsMode:{ALLOWALL:'allow'},createHtmlOutput:s=>{html=s;return {setXFrameOptionsMode:()=>true};}};
 const channel='a'.repeat(64);b.ctx.bridge_(channel);const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
 let handler,calls=0;const sent=[],top={postMessage:(data,origin)=>sent.push({data,origin})};const run={withSuccessHandler:fn=>{run.ok=fn;return run;},withFailureHandler:()=>run,pimCall:()=>{calls++;run.ok('ok');}};
 vm.runInNewContext(script,{window:{top,addEventListener:(_,fn)=>handler=fn},google:{script:{run}}});
 const data={type:'pim-request',channel,id:'request1',request:{action:'hello'}};
 handler({origin:'https://evil.example',source:top,data});handler({origin:'https://phirawitas-hub.github.io',source:{},data});handler({origin:'https://phirawitas-hub.github.io',source:top,data:{...data,channel:'wrong'}});assert.equal(calls,0);
 handler({origin:'https://phirawitas-hub.github.io',source:top,data});assert.equal(calls,1);assert.ok(sent.every(x=>x.origin==='https://phirawitas-hub.github.io'));
});

test('Popup Google bridge answers only its GitHub opener',()=>{const b=backend();let html='';b.ctx.HtmlService={XFrameOptionsMode:{ALLOWALL:'allow'},createHtmlOutput:s=>{html=s;return {setXFrameOptionsMode:()=>true};}};const channel='b'.repeat(64);b.ctx.bridge_(channel);const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));let handler,calls=0;const sent=[],opener={postMessage:(data,origin)=>sent.push({data,origin})},top={opener,postMessage:()=>{throw Error('must target opener');}};const run={withSuccessHandler:fn=>{run.ok=fn;return run;},withFailureHandler:()=>run,pimCall:()=>{calls++;run.ok('ok');}};vm.runInNewContext(script,{window:{top,addEventListener:(_,fn)=>handler=fn},google:{script:{run}}});const data={type:'pim-request',channel,id:'test',request:{action:'hello'}};handler({origin:'https://phirawitas-hub.github.io',source:top,data});assert.equal(calls,0);handler({origin:'https://phirawitas-hub.github.io',source:opener,data});assert.equal(calls,1);assert.equal(sent[0].data.type,'pim-ready');});
