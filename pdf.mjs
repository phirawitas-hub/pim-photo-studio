import {ANGLES,progress} from './core.mjs';
// Canvas lets the browser shape Thai and system fonts correctly. PDF pages embed
// high-resolution JPEGs with native clickable Drive link annotations.
const W=1240,H=1754,M=82,FONT='-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif';
const ink='#1c1c1e',muted='#6c6c73',blue='#007aff';
function bytes(s){return new TextEncoder().encode(s);}
export function assemblePdf(pages){
 const objects=[null,null],kids=[];
 const add=s=>{objects.push(s);return objects.length;};
 pages.forEach(p=>{
  const image=add([bytes('<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpeg.length+' >>\nstream\n'),p.jpeg,bytes('\nendstream')]);
  const content='q 595.276 0 0 841.89 0 0 cm /Im0 Do Q';const stream=add(bytes('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'));
  const annotations=(p.links||[]).map(l=>{if(!/^https:\/\/drive\.google\.com\/file\/d\/[-\w]+\/view$/.test(l.url))throw Error('ลิงก์รูปไม่ถูกต้อง');const x=l.x/p.width*595.276,y=841.89-(l.y+l.h)/p.height*841.89;return add(bytes('<< /Type /Annot /Subtype /Link /Rect ['+[x,y,x+l.w/p.width*595.276,y+l.h/p.height*841.89].map(v=>v.toFixed(3)).join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+l.url+') >> >>'));});
  const page=add(bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 '+image+' 0 R >> >> /Contents '+stream+' 0 R /Annots ['+annotations.map(n=>n+' 0 R').join(' ')+'] >>'));kids.push(page);
 });
 objects[0]=bytes('<< /Type /Catalog /Pages 2 0 R >>');objects[1]=bytes('<< /Type /Pages /Count '+kids.length+' /Kids ['+kids.map(n=>n+' 0 R').join(' ')+'] >>');
 const chunks=[bytes('%PDF-1.4\n%PIM\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((obj,i)=>{offsets.push(length);const parts=[bytes((i+1)+' 0 obj\n'),...(Array.isArray(obj)?obj:[obj]),bytes('\nendobj\n')];for(const part of parts){chunks.push(part);length+=part.length;}});
 const xref=length;chunks.push(bytes('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'));
 return new Blob(chunks,{type:'application/pdf'});
}
export async function createPhotoReport(products,resolvePhoto,onProgress=()=>{}){
 if(!products.length)throw Error('เลือกสินค้าที่มีรูปอย่างน้อย 1 รายการ');if(products.length>10)throw Error('ส่งออกครั้งละไม่เกิน 10 รายการ เพื่อให้รูปคมชัดและไม่ใช้หน่วยความจำมากเกินไป');
 const pages=[];let canvas,ctx,links,y,pageNumber=0;const generated=new Date().toLocaleString('th-TH');
 function font(size=24,weight=400,color=ink){ctx.font=weight+' '+size+'px '+FONT;ctx.fillStyle=color;ctx.textBaseline='top';}
 function wrap(text,maxWidth,size=24,weight=400){font(size,weight);const lines=[];for(const paragraph of String(text??'').split(/\r?\n/)){let line='';for(const ch of paragraph){if(ctx.measureText(line+ch).width>maxWidth&&line){lines.push(line);line=ch;}else line+=ch;}lines.push(line);}return lines;}
 function line(text,x,y,size=24,weight=400,color=ink){font(size,weight,color);ctx.fillText(String(text),x,y);}
 function start(product,label){canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);links=[];pageNumber++;
  line('PIM.',M,66,38,700,blue);line('PHOTO STUDIO',M+104,82,17,600,muted);line(label,W-365,82,17,600,muted);ctx.fillStyle='#e5e5ea';ctx.fillRect(M,132,W-M*2,2);
  y=168;for(const t of wrap(product.code,W-M*2,42,700)){line(t,M,y,42,700);y+=52;}for(const t of wrap(product.name,W-M*2,26,400)){line(t,M,y,26);y+=36;}y+=20;
 }
 async function finish(product){line(generated,M,H-68,16,400,muted);line('PIM PHOTO STUDIO  /  '+String(pageNumber).padStart(2,'0'),W-365,H-68,16,600,muted);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));if(!blob)throw Error('สร้างหน้า PDF ไม่สำเร็จ');pages.push({width:W,height:H,jpeg:new Uint8Array(await blob.arrayBuffer()),links,preview:blob});canvas.width=canvas.height=1;await new Promise(r=>setTimeout(r,0));
 }
 async function block(product,label,value){if(value===undefined||value===null||value==='')return;const lines=wrap(value,W-M*2-24,24);if(y+75>H-120){await finish(product);start(product,'PRODUCT DETAILS / CONTINUED');}line(label,M,y,18,600,muted);y+=31;for(const t of lines){if(y+36>H-120){await finish(product);start(product,'PRODUCT DETAILS / CONTINUED');}line(t,M,y,24);y+=34;}y+=24;}
 for(const [pi,p] of products.entries()){
  const count=progress(p);if(!count.total)throw Error(p.code+' ยังไม่มีรูป');onProgress('จัดหน้า '+p.code+' · '+(pi+1)+'/'+products.length);
  start(p,'PRODUCT PHOTOGRAPHY REPORT');
  const status=count.required===7?'ถ่ายครบทั้ง 7 มุมบังคับ':'อยู่ระหว่างถ่ายภาพ';
  await block(p,'สถานะ',status+' · '+count.total+' รูป · '+count.required+'/7 มุมบังคับ'+(p.dirty||!p.syncedAt?' · ฉบับร่างในเครื่อง':''));
  await block(p,'วัตถุประสงค์',p.purpose);for(const [key,label] of Object.entries({company:'Company',brand:'Brand',group:'Item Group',size:'Size',color:'Color',style:'Style',po:'Purchase Order (PO NO.)',lot:'Ref. Lot No.',uom:'UOM',remark:'Remark'}))await block(p,label,p.fields?.[key]);
  for(const [key,label] of [['physical','Physical Product'],['inner','Original Package (Inner)'],['outer','Original Package (Outer)'],['delivery','Delivery Package']]){const d=p.dimensions?.[key];if(d&&Object.values(d).some(v=>v!==''&&v!==null))await block(p,label,['width','length','height','net','gross'].map((k,i)=>['Width','Length','Height','Net Weight','Gross Weight'][i]+': '+(d[k]??'—')+(i<3?' cm':' kg')).join('   /   '));}
  await block(p,'รายการภาพ',ANGLES.map(a=>a.name+' · '+(p.photos?.[a.id]?.length||0)+' รูป').join('\n'));
  await finish(p);
  const photos=ANGLES.flatMap(a=>(p.photos?.[a.id]||[]).map((photo,i)=>({photo,angle:a,index:i+1})));
  for(let offset=0;offset<photos.length;offset+=4){start(p,'PHOTO GALLERY');const top=y+8,cardW=(W-M*2-28)/2,cardH=(H-130-top-24)/2;
   for(const [i,item] of photos.slice(offset,offset+4).entries()){
    onProgress('โหลดภาพ '+p.code+' · '+(offset+i+1)+'/'+photos.length);
    const url=await resolvePhoto(item.photo);if(!url)throw Error('โหลดภาพ '+item.angle.name+' ของ '+p.code+' ไม่ได้ กรุณาเชื่อมต่อ Google แล้วลองใหม่');
    const img=new Image();img.src=url;try{await img.decode();}catch{throw Error('อ่านภาพ '+item.angle.name+' ไม่สำเร็จ');}
    const x=M+(i%2)*(cardW+28),cy=top+Math.floor(i/2)*(cardH+24),imageH=cardH-112;
    ctx.fillStyle='#f2f2f7';ctx.beginPath();ctx.roundRect(x,cy,cardW,imageH,16);ctx.fill();const scale=Math.min((cardW-24)/img.naturalWidth,(imageH-24)/img.naturalHeight);const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(cardW-iw)/2,cy+(imageH-ih)/2,iw,ih);
    line(item.angle.name,x,cy+imageH+16,21,600);line(item.angle.thai+' · รูปที่ '+item.index,x,cy+imageH+46,19,400,muted);
    if(item.photo.fileId){const url='https://drive.google.com/file/d/'+item.photo.fileId+'/view';line('เปิดรูปต้นฉบับใน Google Drive ↗',x,cy+imageH+75,18,500,blue);links.push({url,x,y:cy+imageH+72,w:cardW,h:30});}else line('ฉบับร่าง · ยังไม่ได้บันทึกลง Drive',x,cy+imageH+75,17,400,muted);
   }await finish(p);
  }
 }
 return {blob:assemblePdf(pages),pages:pages.map(p=>p.preview),filename:'PIM-Photo-'+(products.length===1?products[0].code.replace(/[^\w-]/g,'_'):'Report')+'-'+new Date().toISOString().slice(0,10)+'.pdf'};
}
