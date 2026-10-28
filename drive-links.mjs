// Keep exported links on a public HTML page so Office can hand off to a browser.
const opener='https://phirawitas-hub.github.io/pim-photo-studio/open-photo.html';
export function drivePhotoId(value){
 return typeof value==='string' ? value.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view$/)?.[1]||'' : '';
}
export function drivePhotoUrl(id){
 return typeof id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(id)?'https://drive.google.com/file/d/'+id+'/view':'';
}
export function excelPhotoUrl(value){const id=drivePhotoId(value);return drivePhotoUrl(id)?opener+'?id='+encodeURIComponent(id):'';}
