import {findHeader} from './core.mjs';
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
