export const ANGLES = [
  {id:'top',name:'Top view',thai:'ด้านบน',required:true},
  {id:'under',name:'Under view',thai:'ด้านล่าง',required:true},
  {id:'left',name:'Left side',thai:'ด้านซ้าย',required:true},
  {id:'right',name:'Right side',thai:'ด้านขวา',required:true},
  {id:'inner',name:'Physical Product (Inner)',thai:'ตัวสินค้า',required:true},
  {id:'outer',name:'Original Package (Outer)',thai:'บรรจุภัณฑ์เดิม',required:true},
  {id:'delivery',name:'Delivery Package',thai:'บรรจุภัณฑ์ขนส่ง',required:true},
  {id:'components',name:'All Component',thai:'ส่วนประกอบทั้งหมด',required:false}
];
export const MAX_PHOTOS=5;
export const uid=()=>crypto.randomUUID();
export function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function progress(p){const groups=p.photos||{};return {required:ANGLES.filter(a=>a.required&&groups[a.id]?.length).length,total:ANGLES.reduce((n,a)=>n+(groups[a.id]?.length||0),0)};}
export function status(p){const n=progress(p);return n.required===7?'complete':n.total?'progress':'waiting';}
export function validatePhotos(p){for(const a of ANGLES){if((p.photos?.[a.id]?.length||0)>MAX_PHOTOS)throw Error(a.name+' เพิ่มได้ไม่เกิน 5 รูป');}return ANGLES.filter(a=>a.required&&!p.photos?.[a.id]?.length).map(a=>a.name);}
export function validatePhotoFile(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('รองรับรูป JPG, PNG และ WebP เท่านั้น');if(file.size>20*1024*1024)throw Error('รูปต้องมีขนาดไม่เกิน 20 MB');if(!file.size)throw Error('ไฟล์รูปว่างเปล่า');}
export function normalizeHeader(v){return String(v??'').toLowerCase().replace(/[\s_\-().:]/g,'');}
export function findHeader(rows){for(const row of rows.slice(0,60)){const code=row.cells.findIndex(v=>/itemcode|รหัสสินค้า|^sku$|goodcode/.test(normalizeHeader(v)));const name=row.cells.findIndex(v=>/productname|ชื่อสินค้า|description|goodname/.test(normalizeHeader(v)));if(code>=0&&name>=0)return {row:row.number,code,name,purpose:row.cells.findIndex(v=>/purpose|วัตถุประสงค์/.test(normalizeHeader(v)))};}return {row:rows[0]?.number||1,code:0,name:1,purpose:-1};}
export function mappedProducts(rows,map){const out=[];const seen=new Set();let duplicates=0;let skipped=0;for(const r of rows){if(r.number<=map.row)continue;const code=String(r.cells[map.code]??'').trim();const name=String(r.cells[map.name]??'').trim();if(!code&&!name)continue;if(!code||!name){skipped++;continue;}if(seen.has(code)){duplicates++;continue;}seen.add(code);out.push({code,name,purpose:String(r.cells[map.purpose]??''),sourceRow:r.number,sourceValues:r.cells});}return {products:out,duplicates,skipped};}
export function chunkText(text,size=40000){const out=[];for(let n=0;n<text.length;n+=size)out.push(text.slice(n,n+size));return out.length?out:[''];}
export function safeId(value){const match=String(value||'').match(/\/d\/([\w-]+)/);const id=match?match[1]:String(value||'').trim();if(!/^[\w-]{15,}$/.test(id))throw Error('กรุณาระบุ Google Sheet URL หรือ ID ที่ถูกต้อง');return id;}
