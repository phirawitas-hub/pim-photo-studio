import {excelPhotoUrl} from './drive-links.mjs';
// Native XLSX hyperlinks; imported values always remain data, never formulas.
export function createExcelWorkbook(XLSX,rows){
 const headers=rows[0]||[],data=XLSX.utils.aoa_to_sheet(rows),book=XLSX.utils.book_new();
 const col=name=>headers.indexOf(name);
 const identity=['Item Code','Product Name','Revision','ชื่อผู้ถ่าย','ชื่อผู้ขอ','Purpose','ไฟล์นำเข้า','วันที่อัปโหลดไฟล์'];
 const photos=headers.map((h,c)=>({label:h.replace(' · Drive URL',''),c})).filter(({c})=>headers[c].endsWith(' · Drive URL')).filter(({label,c})=>rows.slice(1).some(v=>v[c]||v[col(label+' · File name')]||v[col(label+' · สถานะ')]));
 const matrix=[[...identity,...photos.map(p=>p.label)]];
 for(let r=1;r<rows.length;r++){
  const values=rows[r];
  matrix.push([...identity.map(h=>values[col(h)]??''),...photos.map(({label,c})=>excelPhotoUrl(values[c])?'เปิดรูปใน Drive':values[col(label+' · สถานะ')]||'—')]);
  for(let c=0;c<headers.length;c++){const target=excelPhotoUrl(values[c]);if(target){const cell=data[XLSX.utils.encode_cell({r,c})];cell.l={Target:target,Tooltip:'เปิดรูปในเบราว์เซอร์ → Google Drive'};}}
 }
 const gallery=XLSX.utils.aoa_to_sheet(matrix);
 for(let r=1;r<rows.length;r++)for(let i=0;i<photos.length;i++){
  const {label,c}=photos[i],target=excelPhotoUrl(rows[r][c]);if(!target)continue;
  gallery[XLSX.utils.encode_cell({r,c:identity.length+i})].l={Target:target,Tooltip:'เปิด '+label+' ใน Google Drive'};
 }
 gallery['!cols']=[{wch:22},{wch:42},{wch:12},{wch:22},{wch:24},{wch:40},{wch:42},{wch:24},...photos.map(()=>({wch:29}))];
 gallery['!autofilter']={ref:gallery['!ref']};gallery['!rows']=[{hpt:30},...rows.slice(1).map(()=>({hpt:24}))];
 data['!cols']=headers.map(h=>({wch:h.endsWith('Drive URL')||h==='ลิงก์ไฟล์ต้นฉบับ'?56:/Product Name|Purpose|ต้นฉบับ/.test(h)?40:24}));data['!autofilter']={ref:data['!ref']};data['!rows']=[{hpt:30}];
 XLSX.utils.book_append_sheet(book,gallery,'รูปภาพ');XLSX.utils.book_append_sheet(book,data,'ข้อมูลทั้งหมด');
 return book;
}
