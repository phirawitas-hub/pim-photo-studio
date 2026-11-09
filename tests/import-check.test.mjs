import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {itemCodeKey,reviewImportProducts,requireValidImport} from '../import-check.mjs';

const backend=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const app=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
const google=await readFile(new URL('../google.mjs',import.meta.url),'utf8');
const products=[{code:'1C007056R0090',name:'Wheel',sourceRow:9},{code:'001 BK0000',name:'Part',sourceRow:10}];
function check(codes,readable=true){return {readable,warnings:[],checkedAt:'2026-11-09',items:codes.map(([code,found,locations=[]])=>({code,found,locations}))};}

test('import check retains leading zero and colour suffix, with consistent whitespace and case matching',()=>{
 assert.equal(itemCodeKey(' ００１\t bk0000 '),'001 BK0000');
 const result=reviewImportProducts(products,check([['1C007056R0090',false],['001 BK0000',true,['VP · B-01']]]));
 assert.equal(result.valid,false);assert.equal(result.missing.length,1);assert.match(result.message,/กรุณาตรวจสอบ Item code: 1C007056R0090/);
 assert.equal(result.items[1].locations[0],'VP · B-01');
 const ctx=vm.createContext({Date,Map,Set});vm.runInContext(backend,ctx);let reads=0;
 ctx.stock_=()=>{reads++;return {rows:[{company:'VSP',code:'1C007056R0090 BK0000',location:'B-12-018-A'},{company:'VP',code:'001 BK0000',location:'A'},{company:'VSP',code:'001 BK0000',location:'B'}],warnings:[],checkedAt:'today'};};
 const live=ctx.validateItems_({},products.map(p=>p.code));
 assert.equal(reads,1);assert.equal(live.items[0].found,false);assert.deepEqual(Array.from(live.items[1].locations),['VP · A','VSP · B']);
 assert.equal(ctx.validateItems_({},[' 001  bk0000 ']).items[0].found,true);
 assert.equal(ctx.validateItems_({},['1 BK0000']).items[0].found,false);
});

test('unreadable, empty or partial stock results never label an Item code as missing',()=>{
 for(const reply of [undefined,check([['1C007056R0090',false]],false),check([['1C007056R0090',true]])]){
  const review=reviewImportProducts(products,reply);assert.equal(review.valid,false);assert.equal(review.missing.length,0);assert.ok(review.items.every(p=>p.status==='unknown'));
  assert.throws(()=>requireValidImport(products,reply),/ยังตรวจสอบ/);
 }
 const ctx=vm.createContext({Date,Map,Set});vm.runInContext(backend,ctx);
 for(const stock of [{rows:[],warnings:[]},{rows:[{code:'SKU'}],warnings:['Company missing']}]){
  ctx.stock_=()=>stock;const result=ctx.validateItems_({},['SKU']);assert.equal(result.readable,false);assert.equal(result.items[0].found,null);
 }
});

test('a found Item without Location is distinct from an unknown Item and can be imported',()=>{
 const result=requireValidImport([{code:'001'}],check([['001',true]]));
 assert.equal(result.valid,true);assert.equal(result.noLocation.length,1);assert.equal(result.missing.length,0);
});

test('stock preflight RPC is read-only, bounded, and does not acquire the write lock',()=>{
 let writes=0,locks=0;const ctx=vm.createContext({Date,Map,Set,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet-123456'})},SpreadsheetApp:{openById:()=>({})},LockService:{getScriptLock:()=>{locks++;throw Error('write lock');}}});
 vm.runInContext(backend,ctx);ctx.stock_=()=>({rows:[{code:'SKU',company:'VP',location:'A'}],warnings:[]});ctx.schema_=()=>writes++;
 assert.equal(ctx.pimCall({action:'validateItems',payload:{codes:['SKU']}}).items[0].found,true);
 for(const codes of [[],[null],[''],Array(5001).fill('SKU')])assert.throws(()=>ctx.validateItems_({},codes),/5,000/);
 assert.equal(writes,0);assert.equal(locks,0);
});

test('import confirmation rechecks stock and blocks local and Drive writes if a code became invalid',async()=>{
 let writes=0;const state={result:{products},map:{code:0,name:1}};
 const ctx=vm.createContext({importState:state,cloud:{validateItems:async()=>check([['1C007056R0090',false],['001 BK0000',true]])},busy:()=>{},mappingPreview:()=>{},requireValidImport,uid:()=>{writes++;},db:{commitImport:()=>writes++}});
 vm.runInContext(app.slice(app.indexOf('async function commitImport(){'),app.indexOf('function renderImports(){')),ctx);
 await assert.rejects(ctx.commitImport(),/กรุณาตรวจสอบ Item code/);assert.equal(writes,0);
});

test('a missing code blocks upload before original file or source metadata is written to Drive',async()=>{
 let writes=0;const ctx=vm.createContext({requireValidImport,db:{put:async()=>writes++}});
 vm.runInContext(google.replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 vm.runInContext("config={sheetId:'sheet'}",ctx);ctx.readTable=async()=>[];ctx.validateItems=async()=>check([['BAD',false]]);ctx.upload=async()=>writes++;
 await assert.rejects(ctx.syncImport({id:'batch'},[{code:'BAD'}]),/กรุณาตรวจสอบ Item code/);assert.equal(writes,0);
});

test('late preview validation cannot overwrite a newly selected file',async()=>{
 let resolve;const first={result:{products:[{code:'OLD'}]},checkSignature:'old',checking:true},second={result:{products:[{code:'NEW'}]}};let rendered=0;
 const ctx=vm.createContext({importState:first,cloud:{connected:()=>true,validateItems:()=>new Promise(r=>resolve=r)},mappingPreview:()=>rendered++,updateConnection:()=>{}});
 vm.runInContext(app.slice(app.indexOf('async function checkImportCodes('),app.indexOf('async function commitImport(){')),ctx);
 const pending=ctx.checkImportCodes(first,'old');ctx.importState=second;resolve(check([['OLD',false]]));await pending;
 assert.equal(rendered,0);assert.equal(second.codeCheck,undefined);
});
