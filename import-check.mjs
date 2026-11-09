export const itemCodeKey=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();

// An unreadable stock sheet is not evidence that an Item code is invalid.
export function reviewImportProducts(products,check){
 const byCode=new Map((check?.items||[]).map(item=>[itemCodeKey(item.code),item]));
 const complete=products.every(p=>byCode.has(itemCodeKey(p.code)));
 const readable=check?.readable===true&&complete;
 const items=products.map(p=>({...p,...(byCode.get(itemCodeKey(p.code))||{}),code:p.code,status:readable?(byCode.get(itemCodeKey(p.code)).found?'found':'missing'):'unknown'}));
 const missing=items.filter(p=>p.status==='missing'),noLocation=items.filter(p=>p.status==='found'&&!p.locations?.length);
 return {items,missing,noLocation,readable,valid:readable&&products.length>0&&!missing.length,checkedAt:check?.checkedAt||'',warnings:check?.warnings||[],message:!readable?'ยังตรวจสอบ Item code ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและข้อมูลสต็อก':missing.length?'กรุณาตรวจสอบ Item code: '+missing.map(p=>p.code).join(', '):''};
}

export function requireValidImport(products,check){
 const review=reviewImportProducts(products,check);
 if(!review.valid)throw Error(review.message);
 return review;
}
