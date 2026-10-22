// PIM Photo Studio. Deploy as a Web app with access restricted to yourself.
// Built-in Apps Script services only; no API key, Client ID, or Advanced Services.
const PIM_SCHEMA = {
  PIM_Products:['id','Item Code','Product Name','Purpose','Import ID','Source Sheet','Source Row','Created At'],
  PIM_Revisions:['id','Product ID','Updated At','Complete','Metadata JSON','Photos JSON'],
  PIM_Imports:['id','File Name','Created At','Drive File ID','Source Sheets','Products'],
  PIM_Source:['id','Part','Source Metadata JSON'],
  PIM_Files:['key','Drive File ID','Kind','Product ID','Angle','Size','MIME']
};
const PIM_ANGLES = ['top','under','left','right','inner','outer','delivery','components'];
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('PIM Photo Studio')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
// Only this RPC entrypoint is public. No anonymous HTTP write endpoint.
function pimCall(request) {
  if (!request || !/^[\w-]{15,}$/.test(request.sheetId || '')) throw Error('ระบุ Spreadsheet ID ให้ถูกต้อง');
  const allowed=['hello','read','upload','sourceRows','sourceMeta','products','finishImport','revision','photo'];
  if (!allowed.includes(request.action)) throw Error('ไม่รองรับคำสั่งนี้');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw Error('มีงานบันทึกอยู่ กรุณาลองใหม่');
  try {
    const ss=SpreadsheetApp.openById(request.sheetId), p=request.payload || {};
    if (request.action==='hello') return {title:ss.getName(),sheetId:ss.getId()};
    if (request.action==='read') return table_(ss,p.name);
    if (request.action==='photo') return photo_(ss,p.fileId);
    schema_(ss);
    switch(request.action) {
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
  const rows=table_(ss,'PIM_Revisions').filter(r=>r[1]===p.productId),last=rows[rows.length-1];
  if(last&&last[0]===p.id)return {id:last[0],at:last[2]};
  if((last?last[0]:null)!==(p.baseRevision||null))throw Error('มีเวอร์ชันใหม่ในชีต กรุณาตรวจประวัติก่อนบันทึก');
  const files=table_(ss,'PIM_Files'),seen=new Set();
  const photos=p.photos||{};
  if(Object.keys(photos).some(k=>!PIM_ANGLES.includes(k)))throw Error('มุมภาพไม่ถูกต้อง');
  for(const angle of PIM_ANGLES) {
    const group=photos[angle]||[];if(!Array.isArray(group)||group.length>5)throw Error('มุมละไม่เกิน 5 รูป');
    for(const photo of group) {
      if(seen.has(photo.fileId)||!files.some(r=>r[1]===photo.fileId&&r[2]==='photo'&&r[3]===p.productId&&r[4]===angle))throw Error('ไฟล์ภาพไม่ตรงกับสินค้าและมุม');
      seen.add(photo.fileId);
    }
  }
  const meta=JSON.stringify(p.meta||{}),manifest=JSON.stringify(photos);if(meta.length>40000||manifest.length>40000)throw Error('รายละเอียดมีขนาดใหญ่เกินไป');
  const at=new Date().toISOString(),complete=PIM_ANGLES.slice(0,7).every(a=>(photos[a]||[]).length>0);
  append_(ss,'PIM_Revisions',[[p.id,p.productId,at,complete,meta,manifest]]);
  SpreadsheetApp.flush();return {id:p.id,at};
}
function photo_(ss,fileId) {
  const row=table_(ss,'PIM_Files').find(r=>r[1]===fileId&&r[2]==='photo');
  if(!row)throw Error('ไม่พบรูปของแอปนี้');
  const blob=DriveApp.getFileById(fileId).getBlob();return {mime:blob.getContentType(),base64:Utilities.base64Encode(blob.getBytes())};
}
