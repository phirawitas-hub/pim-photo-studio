import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
function sheet(){const rows=[],links=new Map(),formats=new Map();return {rows,links,formats,getLastRow:()=>rows.length,getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),getMaxRows:()=>10000,getMaxColumns:()=>1000,setFrozenRows(){},getRange(r,c,n=1,m=1){const range={getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(rows[r-1+i]?.[c-1+j]??''))),getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),setValues(vals){vals.forEach((row,i)=>row.forEach((v,j)=>{rows[r-1+i]??=[];rows[r-1+i][c-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}));return range;},setValue(v){return range.setValues([[v]]);},setRichTextValues(vals){vals.forEach((row,i)=>row.forEach((v,j)=>links.set((r+i)+':'+(c+j),v.url)));return range.setValues(vals.map(row=>row.map(v=>v.text)));},setRichTextValue(v){links.set(r+':'+c,v.url);return range.setValue(v.text);},setFontWeight(){return range;},setBackground(){return range;},setFontColor(){return range;},setWrap(){return range;},setNumberFormat(f){formats.set(r+':'+c,f);return range;}};return range;}};}
function fixture(){const ctx=vm.createContext({Date,console,Set,Map,SpreadsheetApp:{newRichTextValue(){const v={};return {setText(t){v.text=t;return this;},setLinkUrl(u){v.url=u;return this;},build(){return v;}};}}});vm.runInContext(code,ctx);const s=sheet(),ss={getSheetByName:()=>s,insertSheet:()=>s,setSpreadsheetTimeZone:()=>{}};const product=['p1','00123','ชื่อสินค้า','ทดสอบ','b1','Form',9,'2026-10-22','VP','A','Good','5'];const cells=[['A5','ชื่อผู้ขอ :'],['B5','ผู้ทดสอบ'],['K5','Date :'],['L5',46317],['A6','แผนก :'],['B6','จัดซื้อ'],['A8','No.\nลำดับที่'],['B8','Item Code\nรหัสสินค้า'],['F8','Product Name\nชื่อสินค้า'],['J8','Purpose of request\nวัตถุประสงค์'],['M8','Custom'],['A9',1],['B9','00123'],['F9','ชื่อสินค้า'],['J9','ทดสอบ'],['M9','=DO_NOT_RUN()'],['B18','P'],['C18','Full View (ภาพรวมของสินค้า)'],['B24','P'],['C24','ภาพ Close-Up']].map(([address,value])=>({address,value,formatted:String(value),type:typeof value==='number'?'n':'s'}));const tables={PIM_Source:[['b1',1,JSON.stringify({sheets:[{name:'Form',cells}]})]],PIM_Imports:[['b1','test.xlsx','','sourceFile']],PIM_Products:[product],PIM_Revisions:[],PIM_ClosedJobs:[],PIM_Selections:[]};ctx.table_=(_,name)=>tables[name]||[];ctx.append_=(_,name,rows)=>{tables[name]??=[];tables[name].push(...rows);};ctx.removeRows_=(_,name,pred)=>{if(!tables[name])return;tables[name]=tables[name].filter(r=>!pred(r));};return {ctx,ss,s,product,tables};}
test('Data maps original Thai headings, request metadata and checked views; keeps leading zero and text',()=>{const {ctx,ss,s,product}=fixture();s.rows.push(['วันที่','ชื่อผู้ขอ','แผนก','\nลำดับที่','รหัสสินค้า','ชื่อสินค้า','วัตถุประสงค์']);ctx.writeData_(ss,product,null,{});const get=h=>s.rows[1][s.rows[0].indexOf(h)];assert.equal(get('วันที่').toISOString().slice(0,10),'2026-10-22');assert.equal(get('ชื่อผู้ขอ'),'ผู้ทดสอบ');assert.equal(get('แผนก'),'จัดซื้อ');assert.equal(get('รหัสสินค้า'),'00123');assert.equal(get('Full View (ภาพรวมของสินค้า)'),'✓');assert.equal(get('Special Picture'),'ภาพ Close-Up');assert.equal(get('Custom'),'=DO_NOT_RUN()');assert.equal(s.rows[0].filter(h=>ctx.dataKey_(h)==='ลำดับที่').length,1);});
test('Data revision updates same row, has clickable separate Drive links, clears removed slots, preserves custom formulas',()=>{const {ctx,ss,s,product}=fixture();ctx.writeData_(ss,product,null,{});s.rows[0].push('Manual Formula');s.rows[1][s.rows[0].length-1]='=SUM(1,2)';const rev=['r1','p1','2026-10-22',false,JSON.stringify({fields:{brand:'VP'},dimensions:{physical:{width:0}},purpose:'New purpose'}),JSON.stringify({top:[{fileId:'photo1'},{fileId:'photo2'}]})];ctx.writeData_(ss,product,rev,{});ctx.writeData_(ss,product,rev,{});assert.equal(s.rows.length,2);const get=h=>s.rows[1][s.rows[0].indexOf(h)];assert.equal(get('Top view 2'),'https://drive.google.com/file/d/photo2/view');assert.equal(get('จำนวนรูป'),2);assert.equal(get('Physical Product · Width (cm)'),0);assert.equal(get('Manual Formula'),'=SUM(1,2)');assert.ok([...s.links.values()].includes('https://drive.google.com/file/d/photo1/view'));rev[5]=JSON.stringify({top:[{fileId:'photo1'}]});ctx.writeData_(ss,product,rev,{});assert.equal(get('Top view 2'),'');assert.equal(get('จำนวนรูป'),1);});
test('Data migration ignores incomplete import batches and is repeatable',()=>{const {ctx,ss,s,tables}=fixture();tables.PIM_Products.push(['pending','X','Pending','','missing','Form',9]);ctx.syncData_(ss,{offset:0});ctx.syncData_(ss,{offset:0});assert.equal(s.rows.length,2);});

test('Data migrates ISO timestamps to native dates without changing the saved instant',()=>{const {ctx,ss,s,product,tables}=fixture();tables.PIM_Imports[0][2]='2026-10-22T03:00:00.000Z';ctx.writeData_(ss,product,null,{});const headers=s.rows[0],savedCol=headers.indexOf('วันที่เวลาบันทึก');s.rows[1][savedCol]='2026-10-23T03:57:44.523Z';ctx.writeData_(ss,product,null,{});assert.equal(s.rows[1][savedCol].toISOString(),'2026-10-23T03:57:44.523Z');assert.equal(s.formats.get('2:'+(savedCol+1)),'dd/MM/yyyy HH:mm:ss');assert.equal(s.rows[1][headers.indexOf('วันที่เวลานำเข้าระบบ')].toISOString(),'2026-10-22T03:00:00.000Z');ctx.writeData_(ss,product,null,{});assert.equal(s.rows[1][savedCol].toISOString(),'2026-10-23T03:57:44.523Z');});

test('Data reports six photographed angles plus one exemption without a seventh photo',()=>{
 const {ctx,ss,s,product}=fixture();
 const photos=Object.fromEntries(['top','under','left','inner','outer','delivery'].map(id=>[id,[{fileId:id}]]));
 const meta={fields:{notApplicableAngles:['right','top']}};
 ctx.writeData_(ss,product,['r1','p1','2026-11-26',true,JSON.stringify(meta),JSON.stringify(photos)],{});
 const cell=h=>s.rows[1][s.rows[0].indexOf(h)];
 assert.equal(cell('มุมบังคับครบ'),'7/7 (ยกเว้น 1 มุม)');
 assert.equal(cell('จำนวนรูป'),6);
 assert.equal(cell('สถานะถ่ายภาพ'),'ครบทุกมุมที่ใช้');
 assert.equal(cell('Right side 1'),'');
});

test('setJobClosed_ immediately updates Data status to ปิดงานแล้ว for unphotographed jobs and restores รอถ่ายรูป when reopened',()=>{
 const {ctx,ss,s,product}=fixture();
 ctx.writeData_(ss,product,null,{});
 const cell=(row,h)=>s.rows[row][s.rows[0].indexOf(h)];
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'รอถ่ายรูป');
 const slotKey=ctx.stockSlotKey_(product[8],product[9],product[10]);
 ctx.setJobClosed_(ss,{productId:'p1',importId:'b1',slotKey,closed:true});
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'ปิดงานแล้ว');
 assert.ok(cell(1,'อัปเดตล่าสุด') instanceof Date);
 ctx.setJobClosed_(ss,{productId:'p1',importId:'b1',slotKey,closed:false});
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'รอถ่ายรูป');
 assert.equal(cell(1,'อัปเดตล่าสุด'),'');
});

test('setJobClosed_ updates Data status to ปิดงานแล้ว for partially photographed jobs while preserving photo counts and restores กำลังดำเนินการ when reopened',()=>{
 const {ctx,ss,s,product,tables}=fixture();
 const rev=['r1','p1','2026-11-26T05:00:00.000Z',false,JSON.stringify({fields:{photographer:'Test'}}),JSON.stringify({top:[{fileId:'photo1'}]})];
 tables.PIM_Revisions.push(rev);
 tables.PIM_Selections.push(['p1','r1','2026-11-26T05:00:00.000Z']);
 ctx.writeData_(ss,product,rev,{});
 const cell=(row,h)=>s.rows[row][s.rows[0].indexOf(h)];
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'กำลังดำเนินการ');
 const slotKey=ctx.stockSlotKey_(product[8],product[9],product[10]);
 ctx.setJobClosed_(ss,{productId:'p1',importId:'b1',slotKey,closed:true});
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'ปิดงานแล้ว');
 assert.equal(cell(1,'จำนวนรูป'),1);
 assert.equal(cell(1,'มุมบังคับครบ'),'1/7');
 ctx.setJobClosed_(ss,{productId:'p1',importId:'b1',slotKey,closed:false});
 assert.equal(cell(1,'สถานะถ่ายภาพ'),'กำลังดำเนินการ');
 assert.equal(cell(1,'อัปเดตล่าสุด').toISOString(),'2026-11-26T05:00:00.000Z');
});

test('syncData_ writes ปิดงานแล้ว for closed jobs without borrowing sibling revisions and updates waived-angle jobs to ครบทุกมุมที่ใช้',()=>{
 const {ctx,ss,s,tables}=fixture();
 const p2=['p2','00123','ชื่อสินค้า','ทดสอบ','b1','Form',9,'2026-10-22','VP','A','Good','5'];
 const p3=['p3','00123','ชื่อสินค้า','ทดสอบ','b1','Form',10,'2026-10-22','VP','A','Good','3'];
 tables.PIM_Products.push(p2,p3);
 const photosComplete=Object.fromEntries(['top','under','left','inner','outer','delivery'].map(id=>[id,[{fileId:id}]]));
 const rev1=['r1','p1','2026-11-26T06:00:00.000Z',true,JSON.stringify({fields:{notApplicableAngles:['right']}}),JSON.stringify(photosComplete)];
 tables.PIM_Revisions.push(rev1);
 tables.PIM_Selections.push(['p1','r1','2026-11-26T06:00:00.000Z']);
 tables.PIM_ClosedJobs.push(['p2','2026-11-26T07:00:00.000Z']);
 ctx.writeData_(ss,tables.PIM_Products[0],rev1,{});
 ctx.writeData_(ss,p2,null,{});
 s.rows[1][s.rows[0].indexOf('สถานะถ่ายภาพ')]='กำลังดำเนินการ';
 s.rows[2][s.rows[0].indexOf('สถานะถ่ายภาพ')]='รอถ่ายรูป';
 ctx.syncData_(ss,{offset:0});
 const findRow=pid=>s.rows.find(r=>r[s.rows[0].indexOf('PIM Product ID')]===pid);
 assert.equal(findRow('p1')[s.rows[0].indexOf('สถานะถ่ายภาพ')],'ครบทุกมุมที่ใช้');
 assert.equal(findRow('p2')[s.rows[0].indexOf('สถานะถ่ายภาพ')],'ปิดงานแล้ว');
 assert.equal(findRow('p3')[s.rows[0].indexOf('สถานะถ่ายภาพ')],'ครบทุกมุมที่ใช้');
 assert.ok(!tables.PIM_Selections.some(r=>r[0]==='p2'));
});
