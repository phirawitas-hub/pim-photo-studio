import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeInventoryStatus,stockSlotKey,productScopeKey,expandImportProducts,reviewImportProducts} from '../import-check.mjs';
import {pdfFilename} from '../pdf.mjs';
import {csvRows} from '../export.mjs';

const backendCode=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const googleCode=await readFile(new URL('../google.mjs',import.meta.url),'utf8');

function mockSheet(initial=[]){
 const rows=initial.map(r=>[...r]);
 return {
  rows,
  getLastRow:()=>rows.length,
  getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),
  getMaxRows:()=>Math.max(1000,rows.length+10),
  getMaxColumns:()=>Math.max(100,Math.max(0,...rows.map(r=>r.length))+10),
  getDataRange:()=>({getDisplayValues:()=>rows.map(r=>r.map(v=>String(v??'')))}),
  insertRowsAfter(){},
  insertColumnsAfter(){},
  setFrozenRows(){},
  getRange(r,c,n=1,m=1){
   const range={
    getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(rows[r-1+i]?.[c-1+j]??''))),
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),
    setValues(vals){vals.forEach((row,i)=>row.forEach((v,j)=>{rows[r-1+i]??=[];rows[r-1+i][c-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}));return range;},
    setValue(v){return range.setValues([[v]]);},
    setRichTextValues(vals){return range.setValues(vals.map(row=>row.map(v=>v.text)));},
    setFontWeight(){return range;},setBackground(){return range;},setFontColor(){return range;},setWrap(){return range;},setNumberFormat(){return range;}
   };
   return range;
  }
 };
}

test('inventory status normalization unifies casing and expands every Company + Location + Status row',()=>{
 assert.equal(normalizeInventoryStatus('DAMAGE'),'Damage');
 assert.equal(normalizeInventoryStatus(' GOOD '),'Good');
 assert.equal(normalizeInventoryStatus('qc'),'QC');
 assert.equal(stockSlotKey('vp','b-helmet-02-16','DAMAGE'),stockSlotKey('VP','B-HELMET-02-16','Damage'));

 const check={
  readable:true,warnings:[],checkedAt:'2026-11-20',
  items:[
   {
    code:'800353',found:true,
    locations:['VP · B-01-025-A','VP · B-HELMET-02-16','VP · B-HELMET-03-20','VP · B-HELMET-04-02'],
    stocks:[
     {company:'VP',location:'B-01-025-A',status:'Incomplete',qty:'43'},
     {company:'VP',location:'B-HELMET-02-16',status:'DAMAGE',qty:'43'},
     {company:'VP',location:'B-HELMET-03-20',status:'Damage',qty:'33'},
     {company:'VP',location:'B-HELMET-04-02',status:'Damage',qty:'7'}
    ]
   },
   {
    code:'5A002192000BR WH0000',found:true,
    locations:['VSP · B-12-025-C','VSP · B-13-023-C'],
    stocks:[
     {company:'VSP',location:'B-12-025-C',status:'GOOD',qty:'7'},
     {company:'VSP',location:'B-13-023-C',status:'Good',qty:'10'}
    ]
   }
  ]
 };
 const review=reviewImportProducts([{code:'800353',name:'น้ำมันเครื่อง10W60',sourceRow:9},{code:'5A002192000BR WH0000',name:'ชิ้นส่วน',sourceRow:10}],check);
 assert.equal(review.valid,true);
 assert.equal(review.expanded.length,6);
 const oil=review.expanded.filter(p=>p.code==='800353');
 assert.equal(oil.length,4);
 assert.deepEqual(oil.map(p=>[p.stockCompany,p.stockLocation,p.stockStatus,p.stockQty]),[
  ['VP','B-01-025-A','Incomplete','43'],
  ['VP','B-HELMET-02-16','Damage','43'],
  ['VP','B-HELMET-03-20','Damage','33'],
  ['VP','B-HELMET-04-02','Damage','7']
 ]);
 const good=review.expanded.filter(p=>p.code==='5A002192000BR WH0000');
 assert.equal(good.length,2);
 assert.deepEqual(good.map(p=>[p.stockLocation,p.stockStatus]),[['B-12-025-C','Good'],['B-13-023-C','Good']]);
});

test('Apps Script isolates revision history, saves and syncData per Company + Location + Status scope',()=>{
 const tables=new Map(),writes=[];
 const ctx=vm.createContext({
  console,Date,Set,Map,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet-123456'})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>({getId:()=> 'test-sheet-123456',getName:()=> 'Test'}),flush(){}}
 });
 vm.runInContext(backendCode,ctx);
 ctx.writeData_=()=>{};ctx.schema_=()=>{};ctx.table_=(_,name)=>tables.get(name)||[];
 ctx.append_=(_,name,rows)=>{writes.push({name,rows});tables.set(name,[...(tables.get(name)||[]),...rows.map(r=>r.map(String))]);};

 tables.set('PIM_Imports',[['b1','req.xlsx','2026-11-20T00:00:00Z','src1','Form','4']]);
 tables.set('PIM_Products',[
  ['p1','800353','Oil','','b1','Form','9','2026-11-20T00:00:00Z','VP','B-01-025-A','Incomplete','43'],
  ['p2','800353','Oil','','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-02-16','Damage','43'],
  ['p3','800353','Oil','','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-03-20','Damage','33']
 ]);
 tables.set('PIM_Files',[
  ['k1','f1','photo','p1','top','10','image/jpeg'],
  ['k2','f2','photo','p2','top','10','image/jpeg']
 ]);

 const call=(action,payload)=>ctx.pimCall({sheetId:'test-sheet-123456',action,payload});
 const r1=call('revision',{id:'rev1',productId:'p1',baseRevision:null,meta:{fields:{photographer:'A'}},photos:{top:[{fileId:'f1'}]}});
 assert.equal(r1.number,1);

 // Saving p2 (Damage at B-HELMET-02-16) must succeed with baseRevision: null and not conflict with p1 (Incomplete).
 const r2=call('revision',{id:'rev2',productId:'p2',baseRevision:null,meta:{fields:{photographer:'B'}},photos:{top:[{fileId:'f2'}]}});
 assert.equal(r2.number,1);

 // p3 (Damage at B-HELMET-03-20) must not be allowed to select p1 or p2 revision, and syncData must not auto-copy them.
 assert.throws(()=>call('selectRevision',{productId:'p3',revisionId:'rev1'}),/Item Code/);
 assert.throws(()=>call('selectRevision',{productId:'p3',revisionId:'rev2'}),/Item Code/);
 assert.equal(call('itemHistory',{code:'800353',productId:'p3'}).length,0);
 assert.equal(call('itemHistory',{code:'800353',productId:'p2'}).length,1);

 const written=[];
 ctx.writeData_=(_,prod,rev)=>written.push([prod[0],rev?.[0]||null]);
 ctx.syncData_({},{batchId:'b1',offset:0});
 assert.deepEqual(written,[['p1','rev1'],['p2','rev2'],['p3',null]]);
});

test('PIM_Products header migrates safely from legacy 8 columns to 12 columns and splitPendingStock splits only unphotographed waiting jobs idempotently',()=>{
 const sheets=new Map([
  ['Stock_VPT_VSP',mockSheet([
   ['Company','Location','Item Code','Description','Inventory\nStatus','SUM ของ On Hand\nQty'],
   ['VP','B-01-025-A','800353','น้ำมันเครื่อง','Incomplete','43'],
   ['VP','B-HELMET-02-16','800353','น้ำมันเครื่อง','DAMAGE','43'],
   ['VP','B-HELMET-03-20','800353','น้ำมันเครื่อง','Damage','33'],
   ['VP','B-HELMET-04-02','800353','น้ำมันเครื่อง','Damage','7'],
   ['VSP','B-06-002-B','DONE-1','ถ่ายแล้ว','Good','5'],
   ['VSP','B-07-001-A','DONE-1','ถ่ายแล้ว','Good','2']
  ])],
  ['PIM_Products',mockSheet([
   ['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At'],
   ['done-id','DONE-1','ถ่ายแล้ว','AFS','b-old','Form','9','2026-11-02T00:00:00Z'],
   ['wait-id','800353','น้ำมันเครื่อง','ลูกค้า','b-new','Form','9','2026-11-19T00:00:00Z']
  ])],
  ['PIM_Imports',mockSheet([
   ['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
   ['b-old','old.xlsx','2026-11-02T00:00:00Z','drv-old','Form','1'],
   ['b-new','new.xlsx','2026-11-19T00:00:00Z','drv-new','Form','1']
  ])],
  ['PIM_Revisions',mockSheet([
   ['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON'],
   ['rev-done','done-id','2026-11-02T01:00:00Z','TRUE','{"fields":{"photographer":"P"}}','{"top":[{"fileId":"f1"}]}']
  ])],
  ['PIM_Selections',mockSheet([
   ['Product ID','Revision ID','Saved At'],
   ['done-id','rev-done','2026-11-02T01:00:00Z']
  ])],
  ['PIM_Files',mockSheet([
   ['key','Drive File ID','Kind','Product ID','Angle','Size','MIME'],
   ['photo-1','f1','photo','done-id','top','100','image/jpeg']
  ])],
  ['PIM_Source',mockSheet([['id','Part','Source Metadata JSON']])],
  ['PIM_Deletions',mockSheet([['Import ID','Deleted At','File Name','Plan JSON','Status']])],
  ['PIM_Branding',mockSheet([['Key','Value']])],
  ['PIM_Options',mockSheet([['Kind','Value','Active']])],
  ['Data',mockSheet([
   ['PIM Product ID','Import ID','รหัสสินค้า','ชื่อสินค้า','สถานะถ่ายภาพ'],
   ['done-id','b-old','DONE-1','ถ่ายแล้ว','ถ่ายครบแล้ว'],
   ['wait-id','b-new','800353','น้ำมันเครื่อง','รอถ่ายรูป']
  ])]
 ]);

 const ss={
  getId:()=>'test-sheet-123456',
  getName:()=>'Test',
  getSheetByName:name=>sheets.get(name)||null,
  insertSheet:name=>{const s=mockSheet();sheets.set(name,s);return s;},
  setSpreadsheetTimeZone(){}
 };
 let seq=0;
 const ctx=vm.createContext({
  console,Date,Set,Map,
  Utilities:{getUuid:()=>'split-uuid-'+(++seq)},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet-123456'})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>ss,flush(){},newRichTextValue(){const v={};return {setText(t){v.text=t;return this;},setLinkUrl(u){v.url=u;return this;},build(){return v;}};}}
 });
 vm.runInContext(backendCode,ctx);

 // Read-only snapshot succeeds on legacy 8-column PIM_Products without throwing or mutating headers.
 const before=ctx.pimCall({sheetId:'test-sheet-123456',action:'snapshot'});
 assert.equal(before.products.length,2);
 assert.equal(sheets.get('PIM_Products').rows[0].length,8);

 // splitPendingStock migrates headers to 12 cols, splits 800353 into 4 rows, leaves DONE-1 untouched.
 const first=ctx.pimCall({sheetId:'test-sheet-123456',action:'splitPendingStock'});
 assert.equal(first.split,1);
 assert.equal(first.created,3);
 assert.equal(sheets.get('PIM_Products').rows[0].length,12);
 assert.equal(sheets.get('PIM_Products').rows.length,6); // header + 1 done + 4 split
 assert.equal(sheets.get('PIM_Products').rows[1][0],'done-id');
 assert.equal(sheets.get('PIM_Products').rows[1][8]||'', '');
 assert.deepEqual(sheets.get('PIM_Products').rows.slice(2).map(r=>[r[1],r[8],r[9],r[10],r[11]]),[
  ['800353','VP','B-01-025-A','Incomplete','43'],
  ['800353','VP','B-HELMET-02-16','Damage','43'],
  ['800353','VP','B-HELMET-03-20','Damage','33'],
  ['800353','VP','B-HELMET-04-02','Damage','7']
 ]);
 assert.equal(sheets.get('PIM_Imports').rows[2][5],4);

 // Data sheet has 4 rows for 800353 with Stock Company, Stock Location, Inventory Status, On Hand Qty.
 const dataRows=sheets.get('Data').rows,dh=dataRows[0];
 const oilData=dataRows.slice(1).filter(r=>r[dh.indexOf('รหัสสินค้า')]==='800353');
 assert.equal(oilData.length,4);
 assert.deepEqual(oilData.map(r=>[r[dh.indexOf('Stock Company')],r[dh.indexOf('Stock Location')],r[dh.indexOf('Inventory Status')],r[dh.indexOf('On Hand Qty')]]),[
  ['VP','B-01-025-A','Incomplete','43'],
  ['VP','B-HELMET-02-16','Damage','43'],
  ['VP','B-HELMET-03-20','Damage','33'],
  ['VP','B-HELMET-04-02','Damage','7']
 ]);

 // Calling splitPendingStock a second time is a no-op (idempotent).
 const second=ctx.pimCall({sheetId:'test-sheet-123456',action:'splitPendingStock'});
 assert.equal(second.split,0);
 assert.equal(second.created,0);
 assert.equal(sheets.get('PIM_Products').rows.length,6);
});

test('google.mjs loadProducts scopes revision history by stock slot and PDF/CSV include status and location',async()=>{
 const ctx=vm.createContext({productScopeKey,normalizeInventoryStatus,Set,Map,Object,Array,JSON,String,Boolean,Date});
 vm.runInContext(googleCode.replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 vm.runInContext("config={sheetId:'sheet-1'}",ctx);
 const loaded=await ctx.loadProducts({
  imports:[['b1']],
  products:[
   ['p1','800353','Oil','','b1','Form','9','2026-11-20T00:00:00Z','VP','B-01-025-A','Incomplete','43'],
   ['p2','800353','Oil','','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-02-16','DAMAGE','43']
  ],
  revisions:[['r1','p1','2026-11-20T01:00:00Z','TRUE',JSON.stringify({fields:{photographer:'P'},revisionNumber:1}),JSON.stringify({top:[{fileId:'f1'}]})]],
  selections:[['p1','r1','2026-11-20T01:00:00Z']]
 });
 assert.equal(loaded[0].baseRevision,'r1');
 assert.equal(loaded[0].stockStatus,'Incomplete');
 assert.equal(loaded[1].baseRevision,null);
 assert.equal(loaded[1].itemHead,null);
 assert.equal(loaded[1].stockStatus,'Damage');

 const name=pdfFilename([loaded[1]],new Date('2026-11-20T04:00:00Z'));
 assert.equal(name,'PIM-Photo-800353-VP-B-HELMET-02-16-Damage-2026-11-20.pdf');
 assert.equal(pdfFilename([{code:'001'}],new Date('2026-11-20T04:00:00Z')),'PIM-Photo-001-2026-11-20.pdf');

 const rows=csvRows(loaded,[{id:'b1',name:'req.xlsx'}],{});
 const map=Object.fromEntries(rows[0].map((h,i)=>[h,rows[2][i]]));
 assert.equal(map['Stock Company'],'VP');
 assert.equal(map['Stock Location'],'B-HELMET-02-16');
 assert.equal(map['Inventory Status'],'Damage');
 assert.equal(map['On Hand Qty (งานถ่าย)'],'43');
});

test('pullCloud automatically splits pending unphotographed jobs once and recovers gracefully on older Apps Script',async()=>{
 const appCode=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
 const {singleFlight,reconcileProduct}=await import('../sync.mjs');
 let splitCalls=0,snapCalls=0,splitMode='ok';
 const pendingRow={id:'wait-1',code:'800353',purpose:'Req',fields:{},dimensions:{},photos:{},baseRevision:null,syncedAt:null,dirty:false,sheetId:'sheet',importSynced:true,stockCompany:'',stockLocation:'',stockStatus:'',stockQty:''};
 const splitRows=[
  {...pendingRow,stockCompany:'VP',stockLocation:'B-01-025-A',stockStatus:'Incomplete',stockQty:'43'},
  {...pendingRow,id:'wait-2',stockCompany:'VP',stockLocation:'B-HELMET-02-16',stockStatus:'Damage',stockQty:'43'}
 ];
 function makeCtx(){
  const local=new Map();
  const ctx=vm.createContext({
   singleFlight,reconcileProduct,Date,JSON,Set,Map,String,Object,Array,Number,Boolean,console,
   syncing:false,syncError:'',lastRefreshAttempt:0,lastSync:'',workspace:{},batches:[],products:[],current:null,modal:{open:false},
   document:{activeElement:{tagName:'BODY'}},location:{hash:'#products'},settings:{},syncResult:null,query:'',batchFilter:'',stockStatusFilter:'',importFrom:'',importTo:'',filter:'all',brand:{},
   fmtDate:x=>x,stamp:()=>'now',toast:()=>{},applyBranding:()=>{},updateConnection:()=>{},$:()=>null,
   cloud:{
    connected:()=>true,
    snapshot:async()=>{snapCalls++;return {imports:[],revisions:[],at:'t'+snapCalls,options:[],data:[],stock:{rows:[{code:'800353',company:'VP',location:'B-01-025-A',status:'Incomplete',qty:'43'}],warnings:[]}};},
    loadProducts:async()=>splitCalls>0&&splitMode==='ok'?splitRows:[pendingRow],
    splitPendingStock:async()=>{splitCalls++;if(splitMode==='old')throw Error('ไม่รองรับคำสั่งนี้');return {split:1,created:1};}
   },
   db:{put:async()=>{},mergeCloudProducts:async(rows,merge)=>{for(const r of rows)local.set(r.id,merge(local.get(r.id),r));return rows.length;}},
   reloadLocal:async()=>{ctx.products=[...local.values()];},
   route:async()=>{}
  });
  vm.runInContext(appCode.slice(appCode.indexOf('const pullCloud=singleFlight('),appCode.indexOf('function openImport()')),ctx);
  ctx.updateSyncStatus=()=>{};ctx.refreshProductView=()=>{};
  return {ctx,local};
 }
 const a=makeCtx();
 await a.ctx.refreshCloud(true);
 assert.equal(splitCalls,1);assert.equal(snapCalls,2);assert.equal(a.local.size,2);
 await a.ctx.refreshCloud(true);
 assert.equal(splitCalls,1); // Already split -> read-only refresh.

 splitCalls=0;snapCalls=0;splitMode='old';
 const b=makeCtx();
 await b.ctx.refreshCloud(true);
 await b.ctx.refreshCloud(true);
 assert.equal(splitCalls,1); // Remembered unsupported backend, did not break refresh.
 assert.equal(b.local.size,1);
});

test('revision freezes stockSnapshot (Location, Status, Qty, timestamp) in PIM_Revisions and Data even if live stock changes later',()=>{
 const sheets=new Map([
  ['PIM_Products',mockSheet([
   ['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At','Stock Company','Stock Location','Inventory Status','Stock Qty'],
   ['p1','800353','Oil','ลูกค้า','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-02-16','Damage','43']
  ])],
  ['PIM_Imports',mockSheet([
   ['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
   ['b1','req.xlsx','2026-11-20T00:00:00Z','drv1','Form','1']
  ])],
  ['PIM_Revisions',mockSheet([['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON']])],
  ['PIM_Selections',mockSheet([['Product ID','Revision ID','Saved At']])],
  ['PIM_Files',mockSheet([
   ['key','Drive File ID','Kind','Product ID','Angle','Size','MIME'],
   ['photo-1','f1','photo','p1','top','100','image/jpeg']
  ])],
  ['PIM_Source',mockSheet([['id','Part','Source Metadata JSON']])],
  ['PIM_Deletions',mockSheet([['Import ID','Deleted At','File Name','Plan JSON','Status']])],
  ['PIM_Branding',mockSheet([['Key','Value']])],
  ['PIM_Options',mockSheet([['Kind','Value','Active']])],
  ['Data',mockSheet([['PIM Product ID','Import ID','รหัสสินค้า','ชื่อสินค้า','สถานะถ่ายภาพ']])]
 ]);
 const ss={
  getId:()=>'test-sheet-123456',getName:()=>'Test',
  getSheetByName:name=>sheets.get(name)||null,
  insertSheet:name=>{const s=mockSheet();sheets.set(name,s);return s;},
  setSpreadsheetTimeZone(){}
 };
 const ctx=vm.createContext({
  console,Date,Set,Map,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet-123456'})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>ss,flush(){},newRichTextValue(){const v={};return {setText(t){v.text=t;return this;},setLinkUrl(u){v.url=u;return this;},build(){return v;}};}}
 });
 vm.runInContext(backendCode,ctx);

 const saved=ctx.pimCall({
  sheetId:'test-sheet-123456',
  action:'revision',
  payload:{
   id:'rev-snap-1',productId:'p1',baseRevision:null,
   meta:{fields:{photographer:'PHIRAWIT'},stockSnapshot:{company:'VP',location:'B-HELMET-02-16',status:'Damage',qty:'39'}},
   photos:{top:[{fileId:'f1'}]}
  }
 });
 assert.equal(saved.stockSnapshot.company,'VP');
 assert.equal(saved.stockSnapshot.location,'B-HELMET-02-16');
 assert.equal(saved.stockSnapshot.status,'Damage');
 assert.equal(saved.stockSnapshot.qty,'39');
 assert.ok(saved.stockSnapshot.capturedAt);

 // Revision Metadata JSON permanently stores the snapshot.
 const revMeta=JSON.parse(sheets.get('PIM_Revisions').rows[1][4]);
 assert.deepEqual(revMeta.stockSnapshot,{...saved.stockSnapshot});

 // Data sheet stores the frozen snapshot and timestamp.
 const dh=sheets.get('Data').rows[0],dr=sheets.get('Data').rows[1];
 assert.equal(dr[dh.indexOf('Stock Company')],'VP');
 assert.equal(dr[dh.indexOf('Stock Location')],'B-HELMET-02-16');
 assert.equal(dr[dh.indexOf('Inventory Status')],'Damage');
 assert.equal(dr[dh.indexOf('On Hand Qty')],'39');
 assert.ok(dr[dh.indexOf('เวลาบันทึกสถานะสต็อก')] instanceof Date);
});

test('updateJobLocations swaps unphotographed locations in place, adds/removes unselected locations, and protects photographed locations',()=>{
 const sheets=new Map([
  ['PIM_Products',mockSheet([
   ['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At','Stock Company','Stock Location','Inventory Status','Stock Qty'],
   ['p-shot','800353','Oil','ลูกค้า','b1','Form','9','2026-11-20T00:00:00Z','VP','B-01-025-A','Incomplete','43'],
   ['p-wait-1','800353','Oil','ลูกค้า','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-02-16','Damage','43'],
   ['p-wait-2','800353','Oil','ลูกค้า','b1','Form','9','2026-11-20T00:00:00Z','VP','B-HELMET-03-20','Damage','33']
  ])],
  ['PIM_Imports',mockSheet([
   ['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
   ['b1','req.xlsx','2026-11-20T00:00:00Z','drv1','Form','3']
  ])],
  ['PIM_Revisions',mockSheet([
   ['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON'],
   ['rev-1','p-shot','2026-11-20T01:00:00Z','TRUE','{"fields":{"photographer":"P"}}','{"top":[{"fileId":"f1"}]}']
  ])],
  ['PIM_Selections',mockSheet([
   ['Product ID','Revision ID','Saved At'],
   ['p-shot','rev-1','2026-11-20T01:00:00Z']
  ])],
  ['PIM_Files',mockSheet([
   ['key','Drive File ID','Kind','Product ID','Angle','Size','MIME'],
   ['photo-1','f1','photo','p-shot','top','100','image/jpeg']
  ])],
  ['PIM_Source',mockSheet([['id','Part','Source Metadata JSON']])],
  ['PIM_Deletions',mockSheet([['Import ID','Deleted At','File Name','Plan JSON','Status']])],
  ['PIM_Branding',mockSheet([['Key','Value']])],
  ['PIM_Options',mockSheet([['Kind','Value','Active']])],
  ['Data',mockSheet([
   ['PIM Product ID','Import ID','รหัสสินค้า','ชื่อสินค้า','Stock Company','Stock Location','Inventory Status','On Hand Qty'],
   ['p-shot','b1','800353','Oil','VP','B-01-025-A','Incomplete','43'],
   ['p-wait-1','b1','800353','Oil','VP','B-HELMET-02-16','Damage','43'],
   ['p-wait-2','b1','800353','Oil','VP','B-HELMET-03-20','Damage','33']
  ])]
 ]);
 for(const s of sheets.values()){s.deleteRows=(start,count)=>s.rows.splice(start-1,count);}
 const ss={
  getId:()=>'test-sheet-123456',getName:()=>'Test',
  getSheetByName:name=>sheets.get(name)||null,
  insertSheet:name=>{const s=mockSheet();s.deleteRows=(start,count)=>s.rows.splice(start-1,count);sheets.set(name,s);return s;},
  setSpreadsheetTimeZone(){}
 };
 let seq=0;
 const ctx=vm.createContext({
  console,Date,Set,Map,
  Utilities:{getUuid:()=>'loc-uuid-'+(++seq)},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet-123456'})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>ss,flush(){},newRichTextValue(){const v={};return {setText(t){v.text=t;return this;},setLinkUrl(u){v.url=u;return this;},build(){return v;}};}}
 });
 vm.runInContext(backendCode,ctx);

 // Cannot remove photographed location (p-shot).
 assert.throws(()=>ctx.pimCall({
  sheetId:'test-sheet-123456',action:'updateJobLocations',
  payload:{importId:'b1',code:'800353',slots:[{company:'VP',location:'B-HELMET-04-02',status:'Damage',qty:'7'}]}
 }),/ถ่ายรูปหรือมีประวัติแล้ว/);

 // Keep p-shot, swap p-wait-1 -> B-HELMET-04-02 in place, remove p-wait-2.
 const res=ctx.pimCall({
  sheetId:'test-sheet-123456',action:'updateJobLocations',
  payload:{importId:'b1',code:'800353',slots:[
   {company:'VP',location:'B-01-025-A',status:'Incomplete',qty:'43'},
   {company:'VP',location:'B-HELMET-04-02',status:'Damage',qty:'7'}
  ]}
 });
 assert.equal(res.kept,1);
 assert.equal(res.updated,1);
 assert.deepEqual(Array.from(res.removed),['p-wait-2']);
 assert.equal(sheets.get('PIM_Products').rows.length,3); // header + p-shot + swapped p-wait-1
 assert.equal(sheets.get('PIM_Products').rows[2][0],'p-wait-1');
 assert.equal(sheets.get('PIM_Products').rows[2][9],'B-HELMET-04-02');
 assert.equal(sheets.get('PIM_Products').rows[2][11],'7');
 assert.equal(sheets.get('PIM_Imports').rows[1][5],2);
 assert.equal(sheets.get('Data').rows.length,3);
 assert.equal(sheets.get('Data').rows[2][5],'B-HELMET-04-02');
});
