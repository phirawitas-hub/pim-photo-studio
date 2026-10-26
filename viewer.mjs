import {ANGLES,esc} from './core.mjs';
export function viewerPhotos(product){
 return ANGLES.flatMap(angle=>(product.photos?.[angle.id]||[]).map((photo,index)=>({photo,angle:angle.id,label:angle.name+' '+(index+1),thai:angle.thai})));
}
export function openPhotoViewer(product,{modal,openModal,modalHeader,photoUrl}){
 const all=viewerPhotos(product);let items=all,index=0,sequence=0,closed=false;
 if(!all.length)return;
 openModal(modalHeader('ดูรูป · '+product.code)+
 '<div class="photo-viewer"><div class="viewer-info"><div><strong>'+esc(product.name)+'</strong><p>Revision '+esc(product.revisionNumber||'ฉบับร่าง')+(product.dirty?' · มีฉบับร่างที่ยังไม่บันทึก':'')+' · โหมดดูรูป</p></div><label>มุมภาพ<select id="viewer-angle"><option value="">ทุกมุม · '+all.length+' รูป</option>'+ANGLES.filter(a=>all.some(p=>p.angle===a.id)).map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></label></div>'+
 '<div class="viewer-stage"><button id="viewer-prev" class="viewer-arrow" aria-label="ภาพก่อนหน้า">‹</button><div class="viewer-canvas"><img id="viewer-image" alt="" hidden><div id="viewer-message" role="status" aria-live="polite">กำลังโหลดภาพ…</div><button id="viewer-retry" hidden>ลองโหลดภาพอีกครั้ง</button></div><button id="viewer-next" class="viewer-arrow" aria-label="ภาพถัดไป">›</button></div>'+
 '<div class="viewer-caption"><div><strong id="viewer-label"></strong><small id="viewer-filename"></small></div><span id="viewer-count"></span></div><div id="viewer-thumbnails" class="viewer-thumbnails" aria-label="เลือกรูป"></div><p class="viewer-help">ใช้ปุ่ม ← → เพื่อเปลี่ยนรูป · Esc เพื่อปิด · ภาพที่เคยเปิดดูจะเก็บไว้ในเครื่องเพื่อเปิดครั้งถัดไปได้เร็วขึ้น</p></div>');
 modal.classList.add('photo-viewer-modal');
 const q=s=>modal.querySelector(s),img=q('#viewer-image'),message=q('#viewer-message'),retry=q('#viewer-retry');
 function setMessage(text){message.textContent=text;message.hidden=false;img.hidden=true;}
 async function show(next){
  index=Math.max(0,Math.min(next,items.length-1));const ticket=++sequence,item=items[index];
  img.onload=null;img.onerror=null;img.removeAttribute('src');img.hidden=true;retry.hidden=true;
  q('#viewer-label').textContent=item.label+' · '+item.thai;
  q('#viewer-filename').textContent=item.photo.name||product.code;
  q('#viewer-count').textContent=(index+1)+' / '+items.length;
  q('#viewer-prev').disabled=index===0;q('#viewer-next').disabled=index===items.length-1;
  modal.querySelectorAll('[data-viewer-index]').forEach(b=>{const selected=Number(b.dataset.viewerIndex)===index;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));if(selected)b.scrollIntoView({block:'nearest',inline:'nearest'});});
  setMessage('กำลังโหลดภาพ…');
  try{
   const url=await photoUrl(item.photo);if(closed||ticket!==sequence)return;
   if(!url){setMessage('รูปนี้อยู่ใน Google Drive กรุณารอการเชื่อมต่อ แล้วกดลองโหลดอีกครั้ง');retry.hidden=false;return;}
   img.alt=item.label+' · '+product.code;
   img.onload=()=>{if(closed||ticket!==sequence)return;img.hidden=false;message.hidden=true;};
   img.onerror=()=>{if(closed||ticket!==sequence)return;setMessage('ไม่สามารถแสดงภาพนี้ได้');retry.hidden=false;};
   img.src=url;
   const thumb=q('[data-viewer-index="'+index+'"] img');if(thumb){thumb.src=url;thumb.hidden=false;}
  }catch(e){if(closed||ticket!==sequence)return;setMessage('โหลดภาพไม่สำเร็จ: '+(e.message||'กรุณาลองอีกครั้ง'));retry.hidden=false;}
 }
 function thumbnails(){
  q('#viewer-thumbnails').innerHTML=items.map((item,i)=>'<button data-viewer-index="'+i+'" aria-label="'+esc(item.label)+'" aria-pressed="false"><span class="viewer-thumb"><img alt="" hidden><span>'+String(i+1).padStart(2,'0')+'</span></span><small>'+esc(item.label)+'</small></button>').join('');
  modal.querySelectorAll('[data-viewer-index]').forEach(b=>b.onclick=()=>show(Number(b.dataset.viewerIndex)));
 }
 q('#viewer-prev').onclick=()=>show(index-1);q('#viewer-next').onclick=()=>show(index+1);retry.onclick=()=>show(index);
 q('#viewer-angle').onchange=e=>{items=e.target.value?all.filter(p=>p.angle===e.target.value):all;thumbnails();show(0);};
 function keydown(e){if(e.target.matches('select,input,textarea'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1));}}
 modal.addEventListener('keydown',keydown);
 function connected(){if(!closed&&!message.hidden)show(index);}
 window.addEventListener('pim-cloud-connected',connected);
 modal.addEventListener('close',()=>{closed=true;sequence++;modal.classList.remove('photo-viewer-modal');modal.removeEventListener('keydown',keydown);window.removeEventListener('pim-cloud-connected',connected);},{once:true});
 thumbnails();show(0);
}
