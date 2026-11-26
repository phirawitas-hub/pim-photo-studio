import {ANGLES,angleNotApplicable,progress} from './core.mjs';
// Canvas lets the browser shape Thai and system fonts correctly. PDF pages embed
// high-resolution JPEGs with native clickable Drive link annotations.
const W=1240,H=1754,M=82,FONT='-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif';
const ink='#1c1c1e',muted='#6c6c73',blue='#007aff';
function stockPalette(status){
 const s=String(status||'').trim().toUpperCase();
 if(s==='GOOD')return {bg:'#eaf7ef',fg:'#1a7f46'};
 if(s==='DAMAGE')return {bg:'#fdecec',fg:'#c62828'};
 if(s==='INCOMPLETE')return {bg:'#fff3e0',fg:'#b25e00'};
 if(s==='DISPOSAL')return {bg:'#f1eef8',fg:'#5e35b1'};
 if(s==='QC')return {bg:'#e8f2ff',fg:'#005bb5'};
 if(s==='HOLD')return {bg:'#fff8e1',fg:'#8d6e00'};
 if(s==='BORROW')return {bg:'#e6f7f8',fg:'#007980'};
 return {bg:'#f2f4f8',fg:'#4a5568'};
}
function resolvedStock(product){
 const snap=product?.stockSnapshot||null;
 return {
  company:snap?.company||product?.stockCompany||'',
  location:snap?.location||product?.stockLocation||'',
  status:snap?.status||product?.stockStatus||'',
  qty:snap?.qty!==undefined&&snap?.qty!==''?snap.qty:(product?.stockQty??''),
  capturedAt:snap?.capturedAt||''
 };
}
function stockScopeLine(product){
 const st=resolvedStock(product);
 const parts=[st.company,st.location,st.status].map(v=>String(v||'').trim()).filter(Boolean);
 if(!parts.length)return '';
 const qty=st.qty!==undefined&&st.qty!==null&&String(st.qty).trim()!==''?'  ·  Qty '+String(st.qty).trim():'';
 return parts.join('  ·  ')+qty;
}
export function pdfFilename(products,now=new Date()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(products.length!==1)return 'PIM-Photo-Report-'+day+'.pdf';
 const p=products[0],st=resolvedStock(p),slug=v=>String(v||'').trim().replace(/[^\w-]+/g,'_').replace(/^_+|_+$/g,'');
 const parts=[p.code,st.company,st.location,st.status].map(slug).filter(Boolean);
 return 'PIM-Photo-'+(parts.join('-')||'Item')+'-'+day+'.pdf';
}
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
 if(!products.length)throw Error('เลือกสินค้าที่มีรูปอย่างน้อย 1 รายการ');
 const totalWork=products.reduce((sum,p)=>sum+progress(p).total+1,0);let completedWork=0;const notify=message=>onProgress(message,Math.floor(completedWork/totalWork*100));
 const pages=[];let canvas,ctx,links,y,pageNumber=0;const generated=new Date().toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false});
 function font(size=24,weight=400,color=ink){ctx.font=weight+' '+size+'px '+FONT;ctx.fillStyle=color;ctx.textBaseline='top';}
 function wrap(text,maxWidth,size=24,weight=400){font(size,weight);const lines=[];for(const paragraph of String(text??'').split(/\r?\n/)){let line='';for(const ch of paragraph){if(ctx.measureText(line+ch).width>maxWidth&&line){lines.push(line);line=ch;}else line+=ch;}lines.push(line);}return lines;}
 function line(text,x,y,size=24,weight=400,color=ink){font(size,weight,color);ctx.fillText(String(text),x,y);}
 function start(product,label,coverOnly=false){canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);links=[];pageNumber++;
  line('PIM.',M,66,38,700,blue);line('PHOTO STUDIO',M+104,82,17,600,muted);line(label,W-365,82,17,600,muted);ctx.fillStyle='#e5e5ea';ctx.fillRect(M,132,W-M*2,2);
  y=168;if(coverOnly)return;for(const t of wrap(product.code,W-M*2,42,700)){line(t,M,y,42,700);y+=52;}for(const t of wrap(product.name,W-M*2,26,400)){line(t,M,y,26);y+=36;}
  const scope=stockScopeLine(product);if(scope){const pal=stockPalette(product.stockStatus);line('Stock: '+scope,M,y+4,20,600,pal.fg);y+=34;}
  y+=20;
 }
 async function finish(product){line(generated,M,H-68,16,400,muted);line('PIM PHOTO STUDIO  /  '+String(pageNumber).padStart(2,'0'),W-365,H-68,16,600,muted);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));if(!blob)throw Error('สร้างหน้า PDF ไม่สำเร็จ');pages.push({width:W,height:H,jpeg:new Uint8Array(await blob.arrayBuffer()),links,preview:blob});canvas.width=canvas.height=1;await new Promise(r=>setTimeout(r,0));
 }
 async function block(product,label,value){if(value===undefined||value===null||value==='')return;const lines=wrap(value,W-M*2-24,24);if(y+75>H-120){await finish(product);start(product,'PRODUCT DETAILS / CONTINUED');}line(label,M,y,18,600,muted);y+=31;for(const t of lines){if(y+36>H-120){await finish(product);start(product,'PRODUCT DETAILS / CONTINUED');}line(t,M,y,24);y+=34;}y+=24;}

 function panel(x,cy,w,h,fill='#f5f7fb'){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,cy,w,h,20);ctx.fill();}
 function limited(text,x,cy,width,size,weight,maxLines,color=ink){
  const lines=wrap(text,width,size,weight);for(const [i,t] of lines.slice(0,maxLines).entries()){let value=t;if(i===maxLines-1&&lines.length>maxLines){while(ctx.measureText(value+'…').width>width)value=value.slice(0,-1);value+='…';}line(value,x,cy+i*(size+9),size,weight,color);}return lines.length>maxLines;
 }
 const imageCache=new Map();
 async function imageFor(photo,label){const key=photo.fileId||photo.id;if(imageCache.has(key))return imageCache.get(key);
  const promise=(async()=>{const url=await resolvePhoto(photo);if(!url)throw Error('โหลดภาพ '+label+' ไม่ได้ กรุณาเชื่อมต่อ Google แล้วลองใหม่');const img=new Image();img.src=url;try{await img.decode();}catch{throw Error('อ่านภาพ '+label+' ไม่สำเร็จ');}return img;})();imageCache.set(key,promise);return promise;
 }
 function fitImage(img,x,cy,w,h){const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(w-iw)/2,cy+(h-ih)/2,iw,ih);}
 async function cover(product,count){
  start(product,'PRODUCT PHOTOGRAPHY REPORT',true);
  const primary=product.photos?.inner?.[0]||product.photos?.top?.[0]||ANGLES.flatMap(a=>product.photos?.[a.id]||[])[0];
  const primaryAngle=ANGLES.find(a=>(product.photos?.[a.id]||[]).includes(primary));
  const heroY=168,imageSize=370,textX=M+406,textWidth=W-M-textX;
  panel(M,heroY,imageSize,imageSize);
  fitImage(await imageFor(primary,primaryAngle.name),M+16,heroY+16,imageSize-32,imageSize-32);
  line(primaryAngle.name+' 1',M,heroY+imageSize+16,18,600,muted);
  if(primary.fileId)links.push({url:'https://drive.google.com/file/d/'+primary.fileId+'/view',x:M,y:heroY,w:imageSize,h:imageSize});
  line('PRODUCT / ITEM CODE',textX,heroY+8,17,600,blue);
  let overflow=limited(product.code,textX,heroY+42,textWidth,40,700,3);
  const scope=stockScopeLine(product);
  if(scope){
   overflow=limited(product.name,textX,heroY+194,textWidth,24,500,2)||overflow;
   const pal=stockPalette(product.stockStatus);
   panel(textX,heroY+266,textWidth,40,pal.bg);
   overflow=limited(scope,textX+16,heroY+276,textWidth-32,19,600,1,pal.fg)||overflow;
  }else{
   overflow=limited(product.name,textX,heroY+198,textWidth,25,500,3)||overflow;
  }
  const complete=count.handled===7;
  panel(textX,heroY+316,textWidth,48,complete?'#eaf7ef':'#fff5df');
  line(complete?(count.waived?'ครบทุกมุมที่ใช้ · ยกเว้น '+count.waived+' มุม':'ถ่ายครบทั้ง 7 มุมบังคับ'):'อยู่ระหว่างถ่ายภาพ',textX+18,heroY+329,21,600,complete?'#237a45':'#946000');
  line('Revision '+String(product.revisionNumber||'ฉบับร่าง')+(product.dirty||!product.syncedAt?'  /  ฉบับร่างในเครื่อง':''),textX,heroY+382,18,500,muted);
  y=602;
  const cards=[{x:M,w:240,label:'ภาพทั้งหมด',value:String(count.total)+' รูป'},{x:M+258,w:240,label:'มุมบังคับ',value:count.required+' / 7 มุม'},{x:M+516,w:W-M*2-516,label:'ผู้ถ่ายภาพ',value:product.fields?.photographer||'ยังไม่ระบุ'}];
  for(const c of cards){panel(c.x,y,c.w,112);line(c.label,c.x+20,y+18,17,500,muted);overflow=limited(c.value,c.x+20,y+49,c.w-40,25,600,2)||overflow;}
  y=742;line('วัตถุประสงค์',M,y,20,600);y+=38;
  overflow=limited(product.purpose||'ไม่ได้ระบุ',M,y,W-M*2,24,400,4)||overflow;y+=154;
  line('ขนาดและน้ำหนักสินค้า',M,y,22,600);y+=40;
  const dim=product.dimensions?.physical||{},fields=[['width','กว้าง','cm'],['length','ยาว','cm'],['height','สูง','cm'],['net','น้ำหนักสุทธิ','kg'],['gross','น้ำหนักรวม','kg']];
  const col=(W-M*2)/5;panel(M,y,W-M*2,104);
  fields.forEach(([key,label,unit],i)=>{const x=M+i*col+18;line(label+' ('+unit+')',x,y+18,16,500,muted);const v=dim[key];overflow=limited(v===undefined||v===null||v===''?'—':String(v),x,y+49,col-32,24,600,1)||overflow;});y+=138;
  line('ภาพที่แนบในรายงาน',M,y,22,600);y+=42;
  const half=(W-M*2-24)/2;
  ANGLES.forEach((a,i)=>{const x=M+(i%2)*(half+24),cy=y+Math.floor(i/2)*63,n=product.photos?.[a.id]?.length||0;panel(x,cy,half,52,'#f7f8fa');line(a.name,x+16,cy+15,18,500);line(angleNotApplicable(product,a.id)?'ไม่มีมุมนี้':String(n)+' รูป',x+half-85,cy+15,18,600,n?blue:muted);});
  y+=278;line('บันทึกลงชีตล่าสุด',M,y,17,500,muted);
  line(product.syncedAt?new Date(product.syncedAt).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}):'ยังไม่บันทึก',M,y+29,21,500);
  const snapAt=resolvedStock(product).capturedAt;
  if(snapAt){line('บันทึก Location / สถานะ ณ เวลาถ่าย',M+420,y,17,500,muted);line(new Date(snapAt).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}),M+420,y+29,21,500);}
  await finish(product);return overflow;
 }

 for(const [pi,p] of products.entries()){
  const count=progress(p);if(!count.total)throw Error(p.code+' ยังไม่มีรูป');notify('จัดหน้า '+p.code+' · '+(pi+1)+'/'+products.length);
  const overflow=await cover(p,count);completedWork++;notify('หน้าปกพร้อม');
  const extraFields=Object.entries({company:'Company',brand:'Brand',group:'Item Group',size:'Size',color:'Color',style:'Style',po:'Purchase Order (PO NO.)',lot:'Ref. Lot No.',uom:'UOM',remark:'Remark'}).filter(([key])=>p.fields?.[key]!==undefined&&p.fields[key]!==null&&p.fields[key]!=='');
  const extraDimensions=[['inner','Original Package (Inner)'],['outer','Original Package (Outer)'],['delivery','Delivery Package']].filter(([key])=>Object.values(p.dimensions?.[key]||{}).some(v=>v!==''&&v!==null));
  if(overflow||extraFields.length||extraDimensions.length){
   start(p,'PRODUCT DETAILS');
   if(overflow){await block(p,'Stock (Company · Location · Status)',stockScopeLine(p));await block(p,'วัตถุประสงค์',p.purpose);await block(p,'ชื่อผู้ถ่าย',p.fields?.photographer);}
   for(const [key,label] of extraFields)await block(p,label,p.fields[key]);
   for(const [key,label] of (overflow?[['physical','Physical Product'],...extraDimensions]:extraDimensions)){const d=p.dimensions?.[key];if(d)await block(p,label,['width','length','height','net','gross'].map((k,i)=>['Width','Length','Height','Net Weight','Gross Weight'][i]+': '+(d[k]??'—')+(i<3?' cm':' kg')).join('   /   '));}
   await finish(p);
  }
  const photos=ANGLES.flatMap(a=>(p.photos?.[a.id]||[]).map((photo,i)=>({photo,angle:a,index:i+1})));
  for(let offset=0;offset<photos.length;offset+=4){start(p,'PHOTO GALLERY');const top=y+8,cardW=(W-M*2-28)/2,cardH=(H-130-top-24)/2;
   for(const [i,item] of photos.slice(offset,offset+4).entries()){
    notify('โหลดภาพ '+p.code+' · '+(offset+i+1)+'/'+photos.length);
    const img=await imageFor(item.photo,item.angle.name);completedWork++;notify('โหลดภาพแล้ว');
    const x=M+(i%2)*(cardW+28),cy=top+Math.floor(i/2)*(cardH+24),imageH=cardH-112;
    ctx.fillStyle='#f2f2f7';ctx.beginPath();ctx.roundRect(x,cy,cardW,imageH,16);ctx.fill();const scale=Math.min((cardW-24)/img.naturalWidth,(imageH-24)/img.naturalHeight);const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(cardW-iw)/2,cy+(imageH-ih)/2,iw,ih);
    line(item.angle.name,x,cy+imageH+16,21,600);line(item.angle.thai+' · รูปที่ '+item.index,x,cy+imageH+46,19,400,muted);
    if(item.photo.fileId){const url='https://drive.google.com/file/d/'+item.photo.fileId+'/view';line('เปิดรูปต้นฉบับใน Google Drive ↗',x,cy+imageH+75,18,500,blue);links.push({url,x,y:cy+imageH+72,w:cardW,h:30});}else line('ฉบับร่าง · ยังไม่ได้บันทึกลง Drive',x,cy+imageH+75,17,400,muted);
   }await finish(p);
  }
 }
 return {blob:assemblePdf(pages),pages:pages.map(p=>p.preview),filename:pdfFilename(products)};
}
