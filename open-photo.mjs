import {drivePhotoUrl} from './drive-links.mjs';
const target=drivePhotoUrl(new URLSearchParams(location.search).get('id'));
if(target){const link=document.querySelector('#open');link.href=target;link.hidden=false;location.replace(target);}
else{document.querySelector('#status').textContent='ลิงก์รูปไม่ถูกต้อง';document.querySelector('#help').textContent='กรุณาส่งออกไฟล์ Excel ใหม่จากแอพ PIM แล้วเปิดลิงก์อีกครั้ง';}
