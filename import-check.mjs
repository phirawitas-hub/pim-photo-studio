export const itemCodeKey=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const CANONICAL_STATUS={GOOD:'Good',DAMAGE:'Damage',INCOMPLETE:'Incomplete',DISPOSAL:'Disposal',QC:'QC',HOLD:'Hold',BORROW:'Borrow'};
export function normalizeInventoryStatus(value){
 const text=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
 return text?(CANONICAL_STATUS[text.toUpperCase()]||text):'';
}
export function stockSlotKey(company,location,status){
 return [String(company??'').trim().toUpperCase(),itemCodeKey(location),itemCodeKey(status)].join('|');
}
export function hasStockScope(p){return Boolean(String(p?.stockCompany||'').trim()||String(p?.stockLocation||'').trim()||String(p?.stockStatus||'').trim());}
export function productScopeKey(p){return itemCodeKey(p?.code)+'|'+stockSlotKey(p?.stockCompany,p?.stockLocation,p?.stockStatus);}
export function stockLabel(p){return [p?.stockCompany,p?.stockLocation,normalizeInventoryStatus(p?.stockStatus)].filter(Boolean).join(' · ');}

export function expandImportProducts(products,check){
 const byCode=new Map((check?.items||[]).map(item=>[itemCodeKey(item.code),item]));
 const out=[];
 for(const p of products){
  const item=byCode.get(itemCodeKey(p.code));
  const raw=Array.isArray(item?.stocks)?item.stocks:[];
  const seen=new Set(),slots=[];
  for(const s of raw){
   const company=String(s.company??'').trim().toUpperCase();
   const location=String(s.location??'').trim();
   const status=normalizeInventoryStatus(s.status);
   const qty=s.qty===undefined||s.qty===null?'':String(s.qty).trim();
   const key=stockSlotKey(company,location,status);
   if(seen.has(key))continue;seen.add(key);
   slots.push({company,location,status,qty,key});
  }
  if(!slots.length){out.push({...p,stockCompany:'',stockLocation:'',stockStatus:'',stockQty:'',stockKey:itemCodeKey(p.code)+'|||'});continue;}
  for(const s of slots)out.push({...p,stockCompany:s.company,stockLocation:s.location,stockStatus:s.status,stockQty:s.qty,stockKey:itemCodeKey(p.code)+'|'+s.key});
 }
 return out;
}

// An unreadable stock sheet is not evidence that an Item code is invalid.
export function reviewImportProducts(products,check){
 const byCode=new Map((check?.items||[]).map(item=>[itemCodeKey(item.code),item]));
 const complete=products.every(p=>byCode.has(itemCodeKey(p.code)));
 const readable=check?.readable===true&&complete;
 const items=products.map(p=>({...p,...(byCode.get(itemCodeKey(p.code))||{}),code:p.code,status:readable?(byCode.get(itemCodeKey(p.code)).found?'found':'missing'):'unknown'}));
 const missing=items.filter(p=>p.status==='missing'),noLocation=items.filter(p=>p.status==='found'&&!p.locations?.length);
 const expanded=readable&&!missing.length?expandImportProducts(products,check):[];
 return {items,expanded,totalJobs:expanded.length,missing,noLocation,readable,valid:readable&&products.length>0&&!missing.length,checkedAt:check?.checkedAt||'',warnings:check?.warnings||[],message:!readable?'ยังตรวจสอบ Item code ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและข้อมูลสต็อก':missing.length?'กรุณาตรวจสอบ Item code: '+missing.map(p=>p.code).join(', '):''};
}

export function requireValidImport(products,check){
 const review=reviewImportProducts(products,check);
 if(!review.valid)throw Error(review.message);
 return review;
}
