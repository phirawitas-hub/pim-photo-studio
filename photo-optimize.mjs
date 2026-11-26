// Optimize camera photos on-device before storing and uploading to Drive.
export async function optimizePhoto(file,{maxEdge=1600,quality=0.82,skipBytes=350*1024,createImageBitmapFn=globalThis.createImageBitmap,documentObj=globalThis.document}={}){
 let bmp;
 try{
  bmp=await createImageBitmapFn(file);
 }catch{
  throw Error('อ่านรูปไม่ได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ที่สมบูรณ์');
 }
 try{
  const w=Number(bmp?.width)||0,h=Number(bmp?.height)||0,longest=Math.max(w,h);
  const baseName=file?.name||'photo.jpg';
  if((longest<=maxEdge&&file.size<=skipBytes)||!documentObj?.createElement){
   return {blob:file,name:baseName,size:file.size,optimized:false};
  }
  const scale=Math.min(1,maxEdge/Math.max(1,longest));
  const tw=Math.max(1,Math.round(w*scale)),th=Math.max(1,Math.round(h*scale));
  const canvas=documentObj.createElement('canvas');
  canvas.width=tw;canvas.height=th;
  try{
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#ffffff';
   ctx.fillRect(0,0,tw,th);
   ctx.drawImage(bmp,0,0,tw,th);
   const out=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(out&&out.size>0&&out.size<file.size){
    const normalized=/\.(png|webp|jpeg|heic|heif)$/i.test(baseName)?baseName.replace(/\.(png|webp|jpeg|heic|heif)$/i,'.jpg'):/\.jpg$/i.test(baseName)?baseName:baseName+'.jpg';
    return {blob:out,name:normalized,size:out.size,optimized:true};
   }
  }finally{
   canvas.width=1;canvas.height=1;
  }
  return {blob:file,name:baseName,size:file.size,optimized:false};
 }finally{
  bmp?.close?.();
 }
}
