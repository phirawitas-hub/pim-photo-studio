import {ANGLES,MAX_PHOTOS,progress,status} from './core.mjs';
export function importDay(product,batches=[]){
 const value=batches.find(b=>b.id===product.importId)?.createdAt||product.createdAt;
 if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');
}
export function inImportRange(p,batches,from='',to=''){const day=importDay(p,batches);return (!from&&!to)||!!day&&(!from||day>=from)&&(!to||day<=to);}
export function dateText(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}).replace(',','');}
const drive=id=>id?'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view':'';
const key=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
export function sourceWorkbooks(rows){const groups=new Map();for(const r of rows){if(!groups.has(r[0]))groups.set(r[0],[]);groups.get(r[0]).push(r);}return new Map([...groups].map(([id,parts])=>[id,JSON.parse(parts.sort((a,b)=>Number(a[1])-Number(b[1])).map(r=>r[2]).join(''))]));}
export function sourceFields(p,workbook){
 const sheet=workbook?.sheets?.find(s=>s.name===p.sourceSheet);if(!sheet)return {};
 const rows={};for(const c of sheet.cells||[]){const m=c.address.match(/^([A-Z]+)(\d+)$/);if(!m)continue;let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;(rows[m[2]]??={})[col]=c;}
 const text=c=>String(c?.formatted??c?.value??'');const normalize=v=>String(v).toLowerCase().replace(/[\s_\-().:*]/g,'');
 const meta=v=>{const s=normalize(v);return /ชื่อผู้ขอ|^requester$/.test(s)?'ชื่อผู้ขอ':/แผนก|department/.test(s)?'แผนก':/^(date|วันที่|requestdate)$/.test(s)?'วันที่':'';};
 let header={};for(const n of Object.keys(rows).map(Number).sort((a,b)=>a-b)){if(n>=Number(p.sourceRow))break;if(Object.values(rows[n]).some(c=>/itemcode|รหัสสินค้า|^sku$/.test(normalize(text(c)))))header=rows[n];}
 const out={},source=rows[p.sourceRow]||{};
 for(const [col,c] of Object.entries(source)){const h=text(header[col]).trim()||'คอลัมน์ '+col;out[h+(Object.hasOwn(out,h)?' ['+col+']':'')]=text(c);}
 for(const [n,row] of Object.entries(rows))for(const [col,c] of Object.entries(row)){
  const label=text(c),k=meta(label);
  if(Number(n)<Number(p.sourceRow)&&k){const next=Object.keys(row).map(Number).sort((a,b)=>a-b).find(i=>i>Number(col)&&text(row[i]).trim());if(next)out[k]=text(row[next]);}
  const checked=/^(P|✓|✔|TRUE|1)$/i.test(text(row[Number(col)-1]).trim());
  if(Number(n)>Number(p.sourceRow)&&/^(Full View|Front View|Side View|Back View)/i.test(label))out[label]=checked?'✓':'';
  if(Number(n)>Number(p.sourceRow)&&checked&&/Focus Area|In-Use|Close-Up/i.test(label))out['Special Picture']=(out['Special Picture']?out['Special Picture']+'\n':'')+label;
 }
 return out;
}
export function csvRows(products,batches=[],workspace={},sources=new Map()){
 const records=products.map(p=>{
  const b=batches.find(b=>b.id===p.importId)||{},d=workspace.data?.find(d=>d.id===p.id)||{},n=progress(p);
  const original=sourceFields(p,sources.get(p.importId)||b.workbook);
  const r={'Item Code':p.code,'Product Name':p.name,'Purpose':p.purpose,'ชื่อผู้ขอ':d.requester||original['ชื่อผู้ขอ']||'','แผนก':original['แผนก']||'','วันที่ในแบบฟอร์ม':d.requestDate||original['วันที่']||'','วันที่อัปโหลดไฟล์':dateText(b.createdAt||p.createdAt),'วันที่บันทึกลง Google':dateText(p.syncedAt),'วันที่แก้ไขฉบับร่าง':dateText(p.updatedAt),'ไฟล์นำเข้า':b.name||'','ลิงก์ไฟล์ต้นฉบับ':drive(b.driveId),'แท็บต้นฉบับ':p.sourceSheet||'','แถวต้นฉบับ':p.sourceRow??'','Revision':p.newRevision?'ฉบับร่างใหม่':p.revisionNumber||'','Revision ID':p.baseRevision||'','ชื่อผู้ถ่าย':p.fields?.photographer||'','Remark':p.fields?.remark||'','Required angles':n.required,'Photos':n.total,'Status':status(p),'Google sync':p.dirty?'Local draft':p.importSynced||b.synced?'Saved':'Local draft','Product ID':p.id,'Import ID':p.importId||''};
  for(const [k,label] of Object.entries({company:'Company',brand:'Brand',group:'Item Group',size:'Size',color:'Color',style:'Style',po:'Purchase Order',lot:'Ref. Lot No.',uom:'UOM'}))r[label]=p.fields?.[k]??'';
  for(const [k,v] of Object.entries(p.fields||{}))if(!['photographer','remark','company','brand','group','size','color','style','po','lot','uom'].includes(k))r['ข้อมูลเพิ่มเติม · '+k]=v;
  for(const [g,label] of Object.entries({physical:'Physical Product',inner:'Original Package (Inner)',outer:'Original Package (Outer)',delivery:'Delivery Package'}))for(const [f,name] of Object.entries({width:'Width (cm)',length:'Length (cm)',height:'Height (cm)',net:'Net Weight (kg)',gross:'Gross Weight (kg)'}))r[label+' · '+name]=p.dimensions?.[g]?.[f]??'';
  for(const a of ANGLES)for(let i=0;i<Math.max(MAX_PHOTOS,p.photos?.[a.id]?.length||0);i++){const photo=p.photos?.[a.id]?.[i],label=a.name+' '+(i+1);r[label+' · Drive URL']=drive(photo?.fileId);r[label+' · File name']=photo?.name||'';r[label+' · สถานะ']=photo?(photo.fileId?'บันทึกใน Drive':'ฉบับร่าง ยังไม่มีลิงก์ Drive'):'';}
  const stock=(workspace.stock?.rows||[]).filter(s=>key(s.code)===key(p.code));
  for(const company of ['VP','VSP']){const rows=stock.filter(s=>s.company===company);for(let i=0;i<Math.max(1,rows.length);i++)for(const [k,label] of Object.entries({location:'Location',status:'Inventory Status',categories:'Categories',qty:'On Hand Qty'}))r[company+' '+(i+1)+' · '+label]=rows[i]?.[k]??'';}
  for(const [h,v] of Object.entries(original))r['ต้นฉบับ · '+h]=v;
  return r;
 });
 const headers=[...new Set(records.flatMap(r=>Object.keys(r)))];return [headers,...records.map(r=>headers.map(h=>r[h]??''))];
}
export function encodeCSV(rows){const cell=v=>{let s=typeof v==='object'&&v!==null?JSON.stringify(v):String(v??'');if(/^[\s]*[=+@-]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
