// PIM Photo Studio. Deploy as a Web app with access restricted to yourself.
// Built-in Apps Script services only; no API key, Client ID, or Advanced Services.
const PIM_SCHEMA = {
  PIM_Options:['Kind','Value','Active'],
  PIM_Products:['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At'],
  PIM_Revisions:['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON'],
  PIM_Imports:['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
  PIM_Source:['id','Part','Source Metadata JSON'],
  PIM_Selections:['Product ID','Revision ID','Saved At'],
  PIM_Files:['key','Drive File ID','Kind','Product ID','Angle','Size','MIME']
};
const PIM_ANGLES = ['top','under','left','right','inner','outer','delivery','components'];
function doGet(e) {
  if(e && e.parameter.bridge==='1')return bridge_(e.parameter.channel);

  return HtmlService.createHtmlOutputFromFile('Index').setTitle('PIM Photo Studio')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
// Only this RPC entrypoint is public. No anonymous HTTP write endpoint.
function pimCall(request) {
  if(request && !request.sheetId)request.sheetId=PropertiesService.getScriptProperties().getProperty('PIM_SHEET_ID');
  if (!request || !/^[\w-]{15,}$/.test(request.sheetId || '')) throw Error('ระบุ Spreadsheet ID ให้ถูกต้อง');
  const allowed=['hello','read','upload','sourceRows','sourceMeta','products','finishImport','revision','photo','syncData','stock','selectRevision','itemHistory','workspace','option'];
  if (!allowed.includes(request.action)) throw Error('ไม่รองรับคำสั่งนี้');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw Error('มีงานบันทึกอยู่ กรุณาลองใหม่');
  try {
    const ss=SpreadsheetApp.openById(request.sheetId), p=request.payload || {};
    if (request.action==='hello') return {title:ss.getName(),sheetId:ss.getId()};
    if (request.action==='read') return table_(ss,p.name);
    if (request.action==='workspace') return workspace_(ss);
    if (request.action==='stock') return stock_(ss,p.code);
    if (request.action==='itemHistory') return itemHistory_(ss,p.code);
    if (request.action==='photo') return photo_(ss,p.fileId);
    schema_(ss);
    switch(request.action) {
      case 'option': return option_(ss,p);
      case 'selectRevision': return selectRevision_(ss,p);
      case 'syncData': return syncData_(ss,p);
      case 'upload': return upload_(ss,p);
      case 'sourceRows': return sourceRows_(ss,p);
      case 'sourceMeta':
        id_(p.batchId); if (!Number.isInteger(p.part)||p.part<1||typeof p.text!=='string'||p.text.length>40000) throw Error('ข้อมูลต้นฉบับไม่ถูกต้อง');
        if (!table_(ss,'PIM_Source').some(r=>r[0]===p.batchId&&Number(r[1])===p.part)) append_(ss,'PIM_Source',[[p.batchId,p.part,p.text]]);
        return true;
      case 'products': return products_(ss,p.rows);
      case 'finishImport':
        if (!Array.isArray(p.row)||p.row.length!==6) throw Error('ข้อมูลนำเข้าไม่ถูกต้อง');
        id_(p.row[0]);
        if (!table_(ss,'PIM_Files').some(r=>r[0]==='import-'+p.row[0]&&r[1]===p.row[3])) throw Error('ยังไม่ได้บันทึกไฟล์ต้นฉบับ');
        if (!table_(ss,'PIM_Imports').some(r=>r[0]===p.row[0])) append_(ss,'PIM_Imports',[p.row]);
        return true;
      case 'revision': return revision_(ss,p);
    }
  } finally { lock.releaseLock(); }
}
function id_(value) {
  if (typeof value!=='string'||!/^[-\w]{1,120}$/.test(value)) throw Error('รหัสไม่ถูกต้อง');
  return value;
}
function header_(sheet,name) {
  const expected=PIM_SCHEMA[name];
  if (!expected) throw Error('ไม่รองรับตารางนี้');
  if (sheet.getLastRow() && sheet.getRange(1,1,1,expected.length).getDisplayValues()[0].join('|')!==expected.join('|')) throw Error('โครงสร้างแท็บ '+name+' ต่างจากแอป กรุณาใช้ชีตใหม่');
}
function schema_(ss) {
  Object.keys(PIM_SCHEMA).forEach(name=>{
    const s=ss.getSheetByName(name)||ss.insertSheet(name);header_(s,name);
    if (!s.getLastRow()) {s.getRange(1,1,1,PIM_SCHEMA[name].length).setValues([PIM_SCHEMA[name]]);s.setFrozenRows(1);}
  });
}
function table_(ss,name) {
  if (!PIM_SCHEMA[name]) throw Error('ไม่รองรับตารางนี้');
  const s=ss.getSheetByName(name); if (!s) return [];header_(s,name);
  return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,PIM_SCHEMA[name].length).getDisplayValues().filter(r=>r[0]);
}
function raw_(v) {
  // Apostrophe prevents SpreadsheetApp from evaluating imported Excel formulas.
  // getDisplayValues returns the exact original displayed text.
  if(v===null||v===undefined)return '';
  if(v instanceof Date)return v;
  if(typeof v==='string')return v.length?'\''+v:'';
  if(typeof v==='number'||typeof v==='boolean')return v;
  throw Error('ข้อมูลเซลล์ต้องเป็นข้อความ ตัวเลข หรือค่าจริง/เท็จ');
}
function grow_(s,rows,cols) {
  if(rows>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),rows-s.getMaxRows());
  if(cols>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),cols-s.getMaxColumns());
}
function append_(ss,name,rows) {
  if(!rows.length)return;
  const s=ss.getSheetByName(name),n=PIM_SCHEMA[name].length;
  if(rows.some(r=>r.length!==n))throw Error('จำนวนคอลัมน์ไม่ถูกต้อง');
  grow_(s,s.getLastRow()+rows.length,n);
  s.getRange(s.getLastRow()+1,1,rows.length,n).setValues(rows.map(r=>r.map(raw_)));
}
function root_(ss) {
  const props=PropertiesService.getUserProperties(),key='pim-root-'+ss.getId(),id=props.getProperty(key);
  if(id) {const f=DriveApp.getFolderById(id);if(!f.isTrashed())return f;}
  const f=DriveApp.createFolder('PIM Photo Studio - '+ss.getName());props.setProperty(key,f.getId());return f;
}
function folder_(parent,name) {
  const found=parent.getFoldersByName(name);return found.hasNext()?found.next():parent.createFolder(name);
}
function upload_(ss,p) {
  id_(p.key);
  const previous=table_(ss,'PIM_Files').find(r=>r[0]===p.key);
  if(previous) {if(previous[2]!==p.kind||previous[3]!==(p.productId||'')||previous[4]!==(p.angle||''))throw Error('รหัสไฟล์ซ้ำ');return previous[1];}
  if(!['photo','import'].includes(p.kind))throw Error('ชนิดไฟล์ไม่ถูกต้อง');
  const max=(p.kind==='photo'?20:25)*1024*1024;
  if(typeof p.base64!=='string'||p.base64.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64))throw Error('ไฟล์ใหญ่เกินกำหนดหรือไม่ถูกต้อง');
  const bytes=Utilities.base64Decode(p.base64);if(!bytes.length||bytes.length>max)throw Error('ขนาดไฟล์ไม่ถูกต้อง');
  let parent=root_(ss);
  if(p.kind==='photo') {
    id_(p.productId);
    if(!PIM_ANGLES.includes(p.angle)||!['image/jpeg','image/png','image/webp'].includes(p.mime))throw Error('มุมภาพหรือชนิดรูปไม่ถูกต้อง');
    const b=bytes.slice(0,12).map(x=>x&255);
    const valid=p.mime==='image/jpeg'?b[0]===255&&b[1]===216:p.mime==='image/png'?b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':String.fromCharCode.apply(null,b.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,b.slice(8,12))==='WEBP';
    if(!valid)throw Error('เนื้อหาไฟล์ไม่ตรงกับชนิดรูป');
    const product=table_(ss,'PIM_Products').find(r=>r[0]===p.productId);if(!product)throw Error('ไม่พบสินค้าในชีต');
    parent=folder_(folder_(parent,product[1]+' - '+p.productId),p.angle);
  } else {
    if(!/\.(xlsx|xls|csv)$/i.test(p.name||''))throw Error('รองรับไฟล์ Excel/CSV เท่านั้น');
    parent=folder_(parent,'Imports');
  }
  const name=p.key+'__'+String(p.name||'file').replace(/[\/\\\x00-\x1f]/g,'_').slice(0,180);
  // Deterministic name also recovers an upload if the previous response was lost.
  const found=parent.getFilesByName(name);
  const file=found.hasNext()?found.next():parent.createFile(Utilities.newBlob(bytes,p.mime||'application/octet-stream',name));
  append_(ss,'PIM_Files',[[p.key,file.getId(),p.kind,p.productId||'',p.angle||'',bytes.length,p.mime||'application/octet-stream']]);
  return file.getId();
}
function sourceRows_(ss,p) {
  id_(p.batchId);
  if(!Number.isInteger(p.index)||p.index<0||p.index>500||!Array.isArray(p.rows)||p.rows.length>200)throw Error('ช่วงข้อมูลไม่ถูกต้อง');
  const name='IMP_'+p.batchId.replace(/-/g,'')+'_'+(p.index+1);
  const s=ss.getSheetByName(name)||ss.insertSheet(name);
  for(const r of p.rows) {
    if(!Number.isInteger(r.number)||r.number<1||!Array.isArray(r.cells)||!r.cells.length||r.number*r.cells.length>2000000)throw Error('ช่วงข้อมูลเกินกำหนด');
    grow_(s,r.number,r.cells.length);s.getRange(r.number,1,1,r.cells.length).setValues([r.cells.map(raw_)]);
  }
  return true;
}
function products_(ss,rows) {
  if(!Array.isArray(rows)||rows.length>250)throw Error('จำนวนสินค้าเกินกำหนด');
  const existing=new Set(table_(ss,'PIM_Products').map(r=>r[0])),added=[];
  for(const r of rows) {if(!Array.isArray(r)||r.length!==8)throw Error('ข้อมูลสินค้าไม่ถูกต้อง');id_(r[0]);id_(r[4]);if(!existing.has(r[0])){added.push(r);existing.add(r[0]);}}
  append_(ss,'PIM_Products',added);return true;
}
function revision_(ss,p) {
  id_(p.id);id_(p.productId);
  const product=table_(ss,'PIM_Products').find(r=>r[0]===p.productId);
  if(!product||!table_(ss,'PIM_Imports').some(r=>r[0]===product[4]))throw Error('กรุณาบันทึกไฟล์นำเข้าให้เสร็จก่อน');
  const rows=itemHistory_(ss,product[1]),last=rows[rows.length-1];
  if(last&&last[0]===p.id){selectRevision_(ss,{productId:p.productId,revisionId:last[0]});return {id:last[0],at:last[2],number:rows.length};}
  if((last?last[0]:null)!==(p.baseRevision||null))throw Error('มีเวอร์ชันใหม่ในชีต กรุณาตรวจประวัติก่อนบันทึก');
  const files=table_(ss,'PIM_Files'),seen=new Set(),same=new Set(table_(ss,'PIM_Products').filter(r=>itemKey_(r[1])===itemKey_(product[1])).map(r=>r[0]));
  const photos=p.photos||{};
  if(Object.keys(photos).some(k=>!PIM_ANGLES.includes(k)))throw Error('มุมภาพไม่ถูกต้อง');
  for(const angle of PIM_ANGLES) {
    const group=photos[angle]||[];if(!Array.isArray(group)||group.length>5)throw Error('มุมละไม่เกิน 5 รูป');
    for(const photo of group) {
      if(seen.has(photo.fileId)||!files.some(r=>r[1]===photo.fileId&&r[2]==='photo'&&same.has(r[3])&&r[4]===angle))throw Error('ไฟล์ภาพไม่ตรงกับสินค้าและมุม');
      seen.add(photo.fileId);
    }
  }
  if(!String(p.meta?.fields?.photographer||'').trim())throw Error('กรุณาระบุชื่อผู้ถ่าย');
  const meta=JSON.stringify({...p.meta,revisionNumber:rows.length+1}),manifest=JSON.stringify(photos);if(meta.length>40000||manifest.length>40000)throw Error('รายละเอียดมีขนาดใหญ่เกินไป');
  const at=new Date().toISOString(),complete=PIM_ANGLES.slice(0,7).every(a=>(photos[a]||[]).length>0);
  append_(ss,'PIM_Revisions',[[p.id,p.productId,at,complete,meta,manifest]]);
  selectRevision_(ss,{productId:p.productId,revisionId:p.id});
  SpreadsheetApp.flush();return {id:p.id,at,number:rows.length+1};
}
function photo_(ss,fileId) {
  const row=table_(ss,'PIM_Files').find(r=>r[1]===fileId&&r[2]==='photo');
  if(!row)throw Error('ไม่พบรูปของแอปนี้');
  const blob=DriveApp.getFileById(fileId).getBlob();return {mime:blob.getContentType(),base64:Utilities.base64Encode(blob.getBytes())};
}

// Data is the human-readable working table. PIM_* retain revision/audit records.
const DATA_BASE=['วันที่','ชื่อผู้ขอ','แผนก','ลำดับที่','รหัสสินค้า','ชื่อสินค้า','วัตถุประสงค์','Full View (ภาพรวมของสินค้า)','Front View (ด้านหน้า)','Side View (ด้านข้างซ้าย-ขวา)','Back View (ด้านหลัง)','Special Picture'];
const DATA_ANGLE_NAMES=['Top view','Under view','Left side','Right side','Physical Product (Inner)','Original Package (Outer)','Delivery Package','All Component'];
const DATA_FIELDS={photographer:'ชื่อผู้ถ่าย',company:'Company',brand:'Brand',group:'Item Group',size:'Size',color:'Color',style:'Style',po:'Purchase Order (PO NO.)',lot:'Ref. Lot No.',uom:'UOM',remark:'Remark'};
function normData_(v){return String(v||'').toLowerCase().replace(/[\s_\-().:*]/g,'');}
function dataKey_(v){
 const s=normData_(v);
 if(/itemcode|รหัสสินค้า|^sku$/.test(s))return 'รหัสสินค้า';
 if(/productname|ชื่อสินค้า|^description$/.test(s))return 'ชื่อสินค้า';
 if(/purpose|วัตถุประสงค์/.test(s))return 'วัตถุประสงค์';
 if(/ลำดับที่|^no$/.test(s))return 'ลำดับที่';
 if(/ชื่อผู้ขอ|^requester$/.test(s))return 'ชื่อผู้ขอ';
 if(/แผนก|department/.test(s))return 'แผนก';
 if(/^(date|วันที่|requestdate)$/.test(s))return 'วันที่';
 for(const h of DATA_BASE.slice(7))if(s.startsWith(normData_(h).split('(')[0])||s.startsWith(normData_(h.split(' (')[0])))return h;
 return String(v||'').trim();
}
function sourceData_(ss,product,cache){
 const batchId=product[4];
 if(!cache[batchId]) {
  const parts=table_(ss,'PIM_Source').filter(r=>r[0]===batchId).sort((a,b)=>Number(a[1])-Number(b[1]));
  cache[batchId]=parts.length?JSON.parse(parts.map(r=>r[2]).join('')):{sheets:[]};
 }
 const sheet=(cache[batchId].sheets||[]).find(s=>s.name===product[5]);if(!sheet)return {};
 const rows={};for(const c of sheet.cells||[]){const m=c.address.match(/^([A-Z]+)(\d+)$/);if(!m)continue;let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;if(!rows[m[2]])rows[m[2]]={};rows[m[2]][col]=c;}
 const text=c=>String(c?.formatted??c?.value??'');
 const source=rows[product[6]]||{},out={};
 let header={};for(const n of Object.keys(rows).map(Number).sort((a,b)=>a-b)){if(n>=Number(product[6]))break;if(Object.values(rows[n]).some(c=>dataKey_(text(c))==='รหัสสินค้า'))header=rows[n];}
 for(const [col,c] of Object.entries(header)){const h=dataKey_(text(c));if(h)out[h]=text(source[col]);}
 // Keep unlabeled values in additional columns instead of dropping them.
 for(const [col,c] of Object.entries(source)){if(!header[col]&&text(c))out['ต้นฉบับ คอลัมน์ '+col]=text(c);}
 for(const n of Object.keys(rows))for(const [col,c] of Object.entries(rows[n])){
  const label=text(c),key=dataKey_(label),row=rows[n];
  if(Number(n)<Number(product[6])&&['วันที่','ชื่อผู้ขอ','แผนก'].includes(key)){
   const next=Object.keys(row).map(Number).sort((a,b)=>a-b).find(k=>k>Number(col)&&text(row[k]).trim());
   const value=next?row[next]:null;if(value){out[key]=text(value);if(key==='วันที่'&&value.type==='n'&&Number(value.value)>20000&&Number(value.value)<100000)out[key]=new Date(Math.round((Number(value.value)-25569)*86400000)).toISOString().slice(0,10);}
  }
  const checked=/^(P|✓|✔|TRUE|1)$/i.test(text(row[Number(col)-1]).trim());
  if(Number(n)>Number(product[6])&&/^(Full View|Front View|Side View|Back View)/i.test(label))out[dataKey_(label)]=checked?'✓':'';
  if(Number(n)>Number(product[6])&&checked&&/Focus Area|In-Use|Close-Up/i.test(label))out['Special Picture']=(out['Special Picture']?out['Special Picture']+'\n':'')+label;
 }
 return out;
}
function dataHeaders_(s,extra){
 let headers=s.getLastRow()?s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getDisplayValues()[0]:[];const oldLength=headers.length;
 const required=[...DATA_BASE,...extra,'PIM Product ID','Import ID','ไฟล์นำเข้า','ลิงก์ไฟล์ต้นฉบับ','แท็บต้นฉบับ','แถวต้นฉบับ','สถานะถ่ายภาพ','จำนวนรูป','มุมบังคับครบ','อัปเดตล่าสุด','วันที่เวลาบันทึก','วันที่เวลานำเข้าระบบ','Revision','Revision ID',...Object.values(DATA_FIELDS)];
 for(const group of ['Physical Product','Original Package (Inner)','Original Package (Outer)','Delivery Package'])for(const field of ['Width (cm)','Length (cm)','Height (cm)','Net Weight (kg)','Gross Weight (kg)'])required.push(group+' · '+field);
 for(const name of DATA_ANGLE_NAMES)for(let i=1;i<=5;i++)required.push(name+' '+i);
 const keys=new Set(headers.filter(Boolean).map(h=>normData_(dataKey_(h))));
 for(const h of required){const k=normData_(dataKey_(h));if(!keys.has(k)){headers.push(h);keys.add(k);}}
 grow_(s,Math.max(s.getLastRow(),2),headers.length);
 if(headers.length!==oldLength)s.getRange(1,1,1,headers.length).setValues([headers.map(raw_)]).setFontWeight('bold').setBackground('#e8f0fe').setFontColor('#1c1c1e').setWrap(true);
 s.setFrozenRows(1);return headers;
}
function writeData_(ss,product,revision,cache){
 const imported=table_(ss,'PIM_Imports').find(r=>r[0]===product[4]);if(!imported)return;
 const original=sourceData_(ss,product,cache||{}),s=ss.getSheetByName('Data')||ss.insertSheet('Data');
 const headers=dataHeaders_(s,Object.keys(original)),index={};headers.forEach((h,i)=>{if(h)index[normData_(dataKey_(h))]=i;});
 const idCol=index[normData_('PIM Product ID')];
 const ids=s.getLastRow()>1?s.getRange(2,idCol+1,s.getLastRow()-1,1).getDisplayValues().map(r=>r[0]):[];
 const found=ids.indexOf(product[0]),row=found<0?Math.max(2,s.getLastRow()+1):found+2;
 const values=found<0?Array(headers.length).fill(''):s.getRange(row,1,1,headers.length).getValues()[0];
 const changes={};
 if(found<0||!values[index[normData_('วันที่เวลานำเข้าระบบ')]])changes['วันที่เวลานำเข้าระบบ']=imported[2]||product[7]||'';
 const selected=table_(ss,'PIM_Selections').filter(r=>r[0]===product[0]).pop();
 changes['วันที่เวลาบันทึก']=selected?.[2]||values[index[normData_('วันที่เวลาบันทึก')]]||new Date().toISOString();
 for(const [h,v] of Object.entries(original)){const col=index[normData_(dataKey_(h))];if(found<0||values[col]==='')changes[h]=v;}
 Object.assign(changes,{'PIM Product ID':product[0],'Import ID':product[4],'รหัสสินค้า':product[1],'ชื่อสินค้า':product[2],'วัตถุประสงค์':product[3],'ไฟล์นำเข้า':imported[1],'ลิงก์ไฟล์ต้นฉบับ':'https://drive.google.com/file/d/'+imported[3]+'/view','แท็บต้นฉบับ':product[5],'แถวต้นฉบับ':product[6]});
 if(revision){
  const meta=JSON.parse(revision[4]||'{}'),photos=JSON.parse(revision[5]||'{}');let total=0,required=0;
  PIM_ANGLES.forEach((key,n)=>{const list=photos[key]||[];total+=list.length;if(n<7&&list.length)required++;for(let i=0;i<5;i++)changes[DATA_ANGLE_NAMES[n]+' '+(i+1)]=list[i]?'https://drive.google.com/file/d/'+list[i].fileId+'/view':'';});
  Object.assign(changes,{'วัตถุประสงค์':revision[1]===product[0]?(meta.purpose??product[3]):product[3],'สถานะถ่ายภาพ':required===7?'ถ่ายครบแล้ว':total?'กำลังดำเนินการ':'รอถ่ายรูป','จำนวนรูป':total,'มุมบังคับครบ':required+'/7','อัปเดตล่าสุด':revision[2],'Revision ID':revision[0],'Revision':meta.revisionNumber||itemHistory_(ss,product[1]).findIndex(r=>r[0]===revision[0])+1});
  for(const [key,name] of Object.entries(DATA_FIELDS))changes[name]=meta.fields?.[key]??'';
  ['physical','inner','outer','delivery'].forEach((key,i)=>['width','length','height','net','gross'].forEach((f,j)=>{changes[['Physical Product','Original Package (Inner)','Original Package (Outer)','Delivery Package'][i]+' · '+['Width (cm)','Length (cm)','Height (cm)','Net Weight (kg)','Gross Weight (kg)'][j]]=meta.dimensions?.[key]?.[f]??'';}));
 }else if(found<0)Object.assign(changes,{'สถานะถ่ายภาพ':'รอถ่ายรูป','จำนวนรูป':0,'มุมบังคับครบ':'0/7'});
 grow_(s,row,headers.length);
 // Write only owned cells; preserve any formulas/custom columns outside the app.
 const entries=Object.entries(changes).map(([h,v])=>[index[normData_(dataKey_(h))],v]).filter(([c])=>c!==undefined).sort((a,b)=>a[0]-b[0]);
 const groups=[];for(const entry of entries){const last=groups[groups.length-1];if(last&&last[last.length-1][0]+1===entry[0])last.push(entry);else groups.push([entry]);}
 for(const group of groups)s.getRange(row,group[0][0]+1,1,group.length).setValues([group.map(e=>raw_(e[1]))]);
 // Store native date cells so sorting/filtering works; display Bangkok wall time.
 ss.setSpreadsheetTimeZone('Asia/Bangkok');
 for(const h of ['วันที่เวลาบันทึก','วันที่เวลานำเข้าระบบ','อัปเดตล่าสุด']){
  const col=index[normData_(h)];if(col===undefined)continue;
  const value=changes[h]!==undefined?changes[h]:values[col];
  const date=value instanceof Date?value:new Date(value);
  if(value&&!isNaN(date.getTime()))s.getRange(row,col+1).setValue(date).setNumberFormat('dd/MM/yyyy HH:mm:ss');
 }
 const dateCol=index[normData_('วันที่')],requestDate=changes['วันที่']!==undefined?changes['วันที่']:values[dateCol];
 if(dateCol!==undefined&&(requestDate instanceof Date||/^\d{4}-\d{2}-\d{2}$/.test(String(requestDate))))s.getRange(row,dateCol+1).setValue(new Date(requestDate)).setNumberFormat('dd/MM/yyyy');
 for(const [col,v] of entries)if(typeof v==='string'&&/^https:\/\/drive\.google\.com\/file\/d\/[-\w]+\/view$/.test(v))s.getRange(row,col+1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(v).setLinkUrl(v).build());
 return row;
}
function syncData_(ss,p){
 const all=table_(ss,'PIM_Products'),done=new Set(table_(ss,'PIM_Imports').map(r=>r[0]));
 const products=all.filter(r=>done.has(r[4])&&(!p.batchId||r[4]===p.batchId));
 const offset=Number(p.offset)||0;if(offset<0||!Number.isInteger(offset))throw Error('ช่วงข้อมูลไม่ถูกต้อง');
 const revisions=table_(ss,'PIM_Revisions'),map=new Map();for(const r of revisions)map.set(r[1],r);
 const cache={},chunk=products.slice(offset,offset+50);for(const product of chunk){
  let selection=table_(ss,'PIM_Selections').filter(r=>r[0]===product[0]).pop();
  let rev=selection?revisions.find(r=>r[0]===selection[1]):map.get(product[0]);
  if(!selection&&!rev)rev=itemHistory_(ss,product[1]).filter(r=>Object.values(JSON.parse(r[5]||'{}')).some(a=>a.length)).pop();
  if(!selection&&rev){append_(ss,'PIM_Selections',[[product[0],rev[0],new Date().toISOString()]]);}
  writeData_(ss,product,rev,cache);
 }
 return {count:chunk.length,next:offset+chunk.length<products.length?offset+chunk.length:null,total:products.length};
}

function itemKey_(v){return String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();}
function itemHistory_(ss,code){
 const ids=new Set(table_(ss,'PIM_Products').filter(r=>itemKey_(r[1])===itemKey_(code)).map(r=>r[0]));
 return table_(ss,'PIM_Revisions').filter(r=>ids.has(r[1]));
}
function selectRevision_(ss,p){
 id_(p.productId);id_(p.revisionId);
 const product=table_(ss,'PIM_Products').find(r=>r[0]===p.productId);
 if(!product||!table_(ss,'PIM_Imports').some(r=>r[0]===product[4]))throw Error('ไม่พบงานนำเข้าที่บันทึกเสร็จ');
 const revision=itemHistory_(ss,product[1]).find(r=>r[0]===p.revisionId);
 if(!revision)throw Error('Revision ไม่ตรงกับ Item Code นี้');
 const previous=table_(ss,'PIM_Selections').filter(r=>r[0]===p.productId).pop();
 const at=previous?.[1]===p.revisionId?previous[2]:new Date().toISOString();
 if(previous?.[1]!==p.revisionId)append_(ss,'PIM_Selections',[[p.productId,p.revisionId,at]]);
 writeData_(ss,product,revision,{});return {revision,at};
}
function stock_(ss,code){
 const matches=[],warnings=[];const key=itemKey_(code); 
 for(const company of ['VP','VSP']){
  const name='Stock_'+company,s=ss.getSheetByName(name);if(!s){warnings.push('ไม่พบ '+name);continue;}
  if(!s.getLastRow())continue;
  const data=s.getDataRange().getDisplayValues(),header=data.findIndex(r=>r.some(h=>/^(itemcode|รหัสสินค้า)$/.test(normData_(h))));
  if(header<0){warnings.push(name+' ไม่มีหัวข้อ Item Code หรือข้อมูลยังโหลดไม่เสร็จ');continue;}
  const h=data[header].map(normData_),cols={code:h.findIndex(x=>/^(itemcode|รหัสสินค้า)$/.test(x)),location:h.findIndex(x=>x==='location'),status:h.findIndex(x=>x==='inventorystatus'),categories:h.findIndex(x=>/^categor(y|ies)$/.test(x)),qty:h.findIndex(x=>x.includes('onhandqty'))};
  if(Object.values(cols).some(i=>i<0)){warnings.push(name+' หัวคอลัมน์ไม่ครบ');continue;}
  for(let i=header+1;i<data.length;i++){const r=data[i];if(!r[cols.code]||(key&&itemKey_(r[cols.code])!==key))continue;matches.push({company,code:r[cols.code],location:r[cols.location],status:r[cols.status],categories:r[cols.categories],qty:r[cols.qty]});}
 }
 return {rows:matches,warnings,checkedAt:new Date().toISOString()};
}
// The bridge contains no account UI. Only the authorized GitHub origin can invoke
// it, and responses are sent exclusively to that origin. Google sign-in/access
// restrictions still apply to this deployment. There is no anonymous endpoint.
function bridge_(channel){
 if(!/^[a-f0-9]{64}$/.test(channel||''))throw Error('Invalid channel');
 const origin='https://phirawitas-hub.github.io';
 const html='<!doctype html><meta charset="utf-8"><title>PIM Google connection</title><script>'+ 
 'const channel='+JSON.stringify(channel)+',origin='+JSON.stringify(origin)+';'+
 'window.addEventListener("message",e=>{if(e.origin!==origin||e.source!==window.top||e.data?.channel!==channel||e.data?.type!=="pim-request")return;const id=e.data.id;if(typeof id!=="string")return;google.script.run.withSuccessHandler(value=>window.top.postMessage({type:"pim-response",channel,id,value},origin)).withFailureHandler(error=>window.top.postMessage({type:"pim-response",channel,id,error:error.message||String(error)},origin)).pimCall(e.data.request);});'+
 'window.top.postMessage({type:"pim-ready",channel},origin);<'+ '/script>';
 return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function workspace_(ss){
 const s=ss.getSheetByName('Data'),rows=s&&s.getLastRow()?s.getDataRange().getDisplayValues():[],headers=rows.shift()||[],col=h=>headers.indexOf(h);
 return {options:table_(ss,'PIM_Options').filter(r=>r[2]==='yes'),imports:table_(ss,'PIM_Imports'),stock:stock_(ss,''),data:rows.map(r=>({id:r[col('PIM Product ID')],requester:r[col('ชื่อผู้ขอ')]||'',code:r[col('รหัสสินค้า')]||''})),at:new Date().toISOString()};
}
function option_(ss,p){
 if(!['photographer','remark'].includes(p.kind)||!['add','remove'].includes(p.operation))throw Error('ตัวเลือกไม่ถูกต้อง');
 const value=String(p.value||'').trim();if(!value||value.length>500)throw Error('ระบุข้อความไม่เกิน 500 ตัวอักษร');
 const rows=table_(ss,'PIM_Options'),i=rows.findIndex(r=>r[0]===p.kind&&r[1]===value),active=p.operation==='add'?'yes':'no';
 if(i<0)append_(ss,'PIM_Options',[[p.kind,value,active]]);else ss.getSheetByName('PIM_Options').getRange(i+2,3).setValue(active);
 return table_(ss,'PIM_Options').filter(r=>r[2]==='yes');
}
