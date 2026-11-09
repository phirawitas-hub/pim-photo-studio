// Request the device camera UI directly from the original tap gesture.
export function isMobileCameraDevice(nav=globalThis.navigator){
 const ua=nav?.userAgent||'',platform=nav?.platform||'';
 return !!nav?.userAgentData?.mobile||/Android|iPhone|iPad|iPod/i.test(ua)||(/Macintosh|MacIntel/i.test(ua+' '+platform)&&Number(nav?.maxTouchPoints)>1);
}
let activeCapture=null;
export function cancelNativeCamera(){activeCapture?.();}
export function openNativeCamera({onPhoto,navigator:nav=globalThis.navigator,document:doc=globalThis.document}={}){
 if(!isMobileCameraDevice(nav))throw Error('กรุณาเปิดรายการนี้บนโทรศัพท์หรือ iPad เพื่อถ่ายรูปด้วยกล้องอุปกรณ์');
 cancelNativeCamera();
 const input=doc.createElement('input');input.type='file';input.accept='image/*';input.multiple=false;input.hidden=true;input.setAttribute('capture','environment');
 let done=false;const cleanup=()=>{if(done)return;done=true;input.onchange=null;input.oncancel=null;input.remove();if(activeCapture===cleanup)activeCapture=null;};
 activeCapture=cleanup;input.oncancel=cleanup;input.onchange=()=>{const file=input.files?.[0];cleanup();if(file)onPhoto?.(file);};
 doc.body.append(input);try{input.click();}catch(e){cleanup();throw e;}
 return cleanup;
}
