import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {isMobileCameraDevice,openNativeCamera,cancelNativeCamera} from '../camera.mjs';
const mobile={userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/120',maxTouchPoints:5};
function fixture(){const events=[],inputs=[];return {events,inputs,document:{body:{append:input=>events.push(['append',input])},createElement:tag=>{const input={tag,attrs:{},setAttribute(k,v){this.attrs[k]=v;},click(){events.push(['click',this]);},remove(){events.push(['remove',this]);},files:[]};inputs.push(input);return input;}}};}
test('device capture supports phones and desktop-mode iPad while blocking desktop file pickers',()=>{
 for(const nav of [mobile,{userAgent:'iPhone'},{userAgent:'iPad'},{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}])assert.equal(isMobileCameraDevice(nav),true);
 for(const nav of [{userAgent:'Windows NT',maxTouchPoints:10},{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}])assert.equal(isMobileCameraDevice(nav),false);
 const f=fixture();assert.throws(()=>openNativeCamera({navigator:{userAgent:'Windows NT'},document:f.document}),/โทรศัพท์หรือ iPad/);assert.equal(f.inputs.length,0);
});
test('capture is opened synchronously from the tap with rear camera, one image and no browser camera stream',()=>{
 const f=fixture(),photos=[];let streamCalls=0;openNativeCamera({navigator:{...mobile,mediaDevices:{getUserMedia(){streamCalls++;}}},document:f.document,onPhoto:photo=>photos.push(photo)});
 const input=f.inputs[0];assert.deepEqual(f.events.map(e=>e[0]),['append','click']);assert.equal(input.type,'file');assert.equal(input.accept,'image/*');assert.equal(input.attrs.capture,'environment');assert.equal(input.multiple,false);assert.equal(streamCalls,0);
 const file={name:'camera.jpg',type:'image/jpeg'};input.files=[file];input.onchange();assert.deepEqual(photos,[file]);assert.equal(input.onchange,null);assert.equal(f.events.at(-1)[0],'remove');
});
test('cancel or a newer capture cannot attach an old photo to the next product',()=>{
 const f=fixture(),photos=[];openNativeCamera({navigator:mobile,document:f.document,onPhoto:p=>photos.push(p)});const first=f.inputs[0];openNativeCamera({navigator:mobile,document:f.document,onPhoto:p=>photos.push(p)});assert.equal(first.onchange,null);assert.equal(first.oncancel,null);const second=f.inputs[1];second.oncancel();assert.equal(second.onchange,null);assert.equal(photos.length,0);cancelNativeCamera();
});
test('a camera response is ignored after navigating to a different product',async()=>{
 const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');let callback,added=0,warnings=0;
 const context=vm.createContext({working:false,current:{id:'one'},openNativeCamera:options=>{callback=options.onPhoto;},toast:()=>warnings++,run:fn=>fn(),addPhotos:()=>added++});
 vm.runInContext(source.slice(source.indexOf('function openCamera(angle){'),source.indexOf('const fieldList=')),context);context.openCamera('top');context.current={id:'two'};callback({name:'late.jpg'});assert.equal(added,0);assert.equal(warnings,1);
});
