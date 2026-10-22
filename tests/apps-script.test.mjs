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
 const payload={id:'revision1',productId:'p1',baseRevision:null,photos:{top:[{fileId:'f0'}]},meta:{purpose:'Test'}};
 const first=b.call('revision',payload),again=b.call('revision',payload);
 assert.equal(first.id,again.id);assert.equal(first.at,again.at);assert.equal(b.writes.length,1);assert.equal(b.writes[0].rows[0][3],false);
});
test('source parts are idempotent and formula-like strings are escaped before SpreadsheetApp',()=>{
 const b=backend();b.call('sourceMeta',{batchId:'batch1',part:1,text:'{"formula":"=SUM(A1)"}'});b.call('sourceMeta',{batchId:'batch1',part:1,text:'{"formula":"=SUM(A1)"}'});
 assert.equal(b.writes.length,1);assert.equal(b.ctx.raw_('=IMPORTXML("x")'),"'=IMPORTXML(\"x\")");assert.equal(b.ctx.raw_("'leading quote"),"''leading quote");assert.equal(b.ctx.raw_('00123'),"'00123");assert.equal(b.ctx.raw_(42),42);
});
