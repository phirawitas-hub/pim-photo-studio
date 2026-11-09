import {findHeader,mappedProducts,normalizeHeader} from './core.mjs';
// Use actual cells, never iterate an Excel formatting-only million-row range.
export function inspectWorkbook(XLSX,buffer){
 const wb=XLSX.read(buffer,{type:'array',cellFormula:true,cellNF:true,cellText:true,cellStyles:false});
 const sheets=wb.SheetNames.map(name=>{const ws=wb.Sheets[name];const byRow=new Map();const cells=[];
 for(const address of Object.keys(ws)){if(!/^[A-Z]+\d+$/.test(address))continue;const c=ws[address];if(c.v==null&&!c.f&&!c.l&&!c.c)continue;const {r,c:column}=XLSX.utils.decode_cell(address);const n=r+1;if(!byRow.has(n))byRow.set(n,[]);byRow.get(n)[column]=c.w??String(c.v??'');cells.push({address,type:c.t,value:c.v??null,formatted:c.w??null,formula:c.f??null,format:c.z??null,link:c.l??null,comments:c.c??null});}
 const rows=[...byRow].sort((a,b)=>a[0]-b[0]).map(([number,cells])=>({number,cells:Array.from(cells,v=>v??'')}));
 return {name,rows,cells,merges:ws['!merges']||[],range:ws['!ref']||'',header:findHeader(rows)};
 });
 return {sheets,properties:wb.Props||{},sheetProperties:wb.Workbook?.Sheets||[],names:wb.Workbook?.Names||[]};
}

// Prefer the request form over cover pages or stock/reference tabs.
export function selectImportSheet(workbook){
 const candidates=workbook.sheets.map((sheet,index)=>{
  const map=sheet.header,header=sheet.rows.find(r=>r.number===map.row)?.cells||[];
  const recognized=map.code!==map.name&&/itemcode|รหัสสินค้า|^sku$|goodcode/.test(normalizeHeader(header[map.code]))&&/productname|ชื่อสินค้า|description|goodname/.test(normalizeHeader(header[map.name]));
  return {index,map,recognized,count:recognized?mappedProducts(sheet.rows,map).products.length:0};
 }).filter(x=>x.recognized&&x.count);
 const selected=candidates.find(x=>x.map.purpose>=0)||candidates[0];
 if(!selected)throw Error('ไม่พบรายการสินค้าในแบบฟอร์ม กรุณาตรวจหัวข้อ Item Code และชื่อสินค้าในไฟล์ แล้วเลือกไฟล์ใหม่');
 return {index:selected.index,map:{...selected.map}};
}
