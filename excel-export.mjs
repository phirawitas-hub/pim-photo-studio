const driveLink=value=>typeof value==='string'&&/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(value);
// Native XLSX hyperlinks: no formulas derived from imported cell content.
export function createExcelWorkbook(XLSX,rows){
 const headers=rows[0]||[],data=XLSX.utils.aoa_to_sheet(rows),book=XLSX.utils.book_new();
 const linkColumns=headers.map((h,c)=>h.endsWith(' · Drive URL')?c:-1).filter(c=>c>=0);
 const index=[['Item Code','Product Name','Revision','ชื่อผู้ถ่าย','มุม / ลำดับรูป','ชื่อไฟล์','เปิดรูปใน Drive','สถานะ']];
 const col=name=>headers.indexOf(name);
 for(let r=1;r<rows.length;r++){
  const values=rows[r];for(let c=0;c<headers.length;c++){if(driveLink(values[c])){const cell=data[XLSX.utils.encode_cell({r,c})];cell.l={Target:values[c],Tooltip:'คลิกเปิดใน Google Drive'};}}
  for(const c of linkColumns){const label=headers[c].replace(' · Drive URL',''),url=values[c],name=values[col(label+' · File name')],state=values[col(label+' · สถานะ')];if(!url&&!name&&!state)continue;
   index.push([values[col('Item Code')],values[col('Product Name')],values[col('Revision')],values[col('ชื่อผู้ถ่าย')],label,name||'',driveLink(url)?url:'',state||'']);
  }
 }
 const gallery=XLSX.utils.aoa_to_sheet(index);
 for(let r=1;r<index.length;r++){const target=index[r][6];if(!driveLink(target))continue;const cell=gallery[XLSX.utils.encode_cell({r,c:6})];cell.v='เปิดรูปใน Drive';cell.t='s';cell.l={Target:target,Tooltip:'เปิด '+index[r][4]+' ใน Google Drive'};}
 gallery['!cols']=[{wch:22},{wch:42},{wch:14},{wch:22},{wch:32},{wch:40},{wch:23},{wch:30}];
 gallery['!autofilter']={ref:gallery['!ref']};gallery['!rows']=[{hpt:28}];
 data['!cols']=headers.map(h=>({wch:h.endsWith('Drive URL')||h==='ลิงก์ไฟล์ต้นฉบับ'?56:/Product Name|Purpose|ต้นฉบับ/.test(h)?40:24}));data['!autofilter']={ref:data['!ref']};data['!rows']=[{hpt:30}];
 XLSX.utils.book_append_sheet(book,gallery,'รูปภาพ');XLSX.utils.book_append_sheet(book,data,'ข้อมูลทั้งหมด');
 return book;
}
