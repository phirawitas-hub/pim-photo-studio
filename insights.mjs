// Count files once per import ID for each requester; Items are request rows.
export function requesterRanking(rows,metric='items'){
 const groups=new Map();for(const row of rows){const name=String(row.requester||'ไม่ระบุ').trim()||'ไม่ระบุ';if(!groups.has(name))groups.set(name,{name,items:0,imports:new Set()});const g=groups.get(name);g.items++;if(row.importId)g.imports.add(row.importId);}
 return [...groups.values()].map(g=>({name:g.name,items:g.items,files:g.imports.size})).sort((a,b)=>b[metric]-a[metric]||b.items-a.items||a.name.localeCompare(b.name,'th'));
}
