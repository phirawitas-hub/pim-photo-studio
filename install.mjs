let deferred=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;document.querySelector('#install-app')?.removeAttribute('hidden');});
window.addEventListener('appinstalled',()=>{deferred=null;const b=document.querySelector('#install-app');if(b)b.hidden=true;});
export function initInstall({openModal,modalHeader}){
 if(location.hostname!=='phirawitas-hub.github.io')return;
 const bar=document.querySelector('.topbar');if(!bar)return;
 const button=document.createElement('button');button.id='install-app';button.className='small install-app';button.textContent='ติดตั้งแอป';button.hidden=standalone();bar.insertBefore(button,document.querySelector('#connect-top'));
 matchMedia('(display-mode: standalone)').addEventListener('change',()=>button.hidden=standalone());
 button.onclick=async()=>{
  if(deferred){const prompt=deferred;deferred=null;await prompt.prompt();await prompt.userChoice;return;}
  openModal(modalHeader('ติดตั้ง PIM Photo Studio')+'<div class="modal-body install-guide"><img src="./icons/icon-192.png" alt="PIM Photo Studio"><h3>เปิดจากไอคอนบนอุปกรณ์ได้เลย</h3><p>ติดตั้งครั้งเดียวบนอุปกรณ์นี้ แล้วเปิดใช้งานเป็นหน้าต่างแอป</p><div class="install-step"><b>คอมพิวเตอร์ · Chrome / Edge</b><p>กดไอคอนติดตั้งที่แถบที่อยู่ หรือเปิดเมนูเบราว์เซอร์ → ติดตั้ง PIM Photo Studio / ติดตั้งหน้านี้เป็นแอป</p></div><div class="install-step"><b>Android</b><p>เปิดเมนู Chrome → เพิ่มลงในหน้าจอหลัก → ติดตั้ง</p></div><div class="install-step"><b>iPhone / iPad</b><p>เปิดเมนูแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วกดเพิ่ม</p></div><p class="help">ถ้าติดตั้งแล้ว ให้เปิดจากไอคอน PIM Photo Studio หรือปุ่ม Open in app ของเบราว์เซอร์ การบันทึก Google และโหลดรูปจาก Drive ต้องใช้อินเทอร์เน็ต</p></div>');
 };
}
