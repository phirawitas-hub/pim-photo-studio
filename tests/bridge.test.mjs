import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../bridge.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'').replaceAll('export ','');
function client(storage=new Map(),blocked=false){
 const handlers=[],timers=new Map(),sent=[],events=[];let opens=0,frames=0,id=0;
 const peer={postMessage:(data,origin)=>sent.push({data,origin})};
 const ctx=vm.createContext({SCRIPT_URL:'https://script.google.com/test',location:{origin:'https://phirawitas-hub.github.io'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:{getRandomValues:a=>a.fill(1),randomUUID:()=>String(++id)},Event:class{constructor(type){this.type=type;}},window:{dispatchEvent:e=>events.push(e.type),addEventListener:(_,f)=>handlers.push(f),open:()=>{opens++;return blocked?null:{closed:false,close(){this.closed=true;}};}},document:{createElement:()=>({setAttribute(){},style:{},remove(){}}),body:{append(){frames++;}}},setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),Date});
 vm.runInContext(code,ctx);ctx.bridgeAlive=vm.runInContext("bridgeAlive",ctx);
 return {ctx,storage,peer,sent,timers,events,get opens(){return opens;},get frames(){return frames;},ready(channel=storage.get('pim-google-channel'),origin='https://a-script.googleusercontent.com'){handlers.forEach(f=>f({source:peer,origin,data:{type:'pim-ready',channel}}));}};
}
test('reload reuses authenticated popup channel without opening another window or frame',async()=>{
 const first=client(),connected=first.ctx.prepareBridge(true);first.ready();await connected;
 const next=client(first.storage),reconnected=next.ctx.prepareBridge();next.ready();await reconnected;
 assert.equal(next.opens,0);assert.equal(next.frames,0);assert.equal(next.ctx.bridgeAlive(),true);
});
test('blocked popup can retry; rejected promise is not retained',async()=>{
 const c=client(new Map(),true);await assert.rejects(c.ctx.prepareBridge(true),/ป๊อปอัป/);await assert.rejects(c.ctx.prepareBridge(true),/ป๊อปอัป/);assert.equal(c.opens,2);
});
test('untrusted readiness cannot attach to a saved session',async()=>{
 const c=client(),p=c.ctx.prepareBridge();c.ready('wrong');c.ready(undefined,'https://evil.example');assert.equal(c.ctx.bridgeAlive(),false);c.ready();await p;assert.equal(c.ctx.bridgeAlive(),true);
});
test('transport timeout does not retry a write and later heartbeat permits reconnect',async()=>{
 const c=client(),p=c.ctx.prepareBridge();c.ready();await p;
 const request=c.ctx.bridgeCall({action:'deleteImport'});await Promise.resolve();
 const timeout=[...c.timers.values()].find(x=>x.ms===180000);timeout.f();await assert.rejects(request,e=>e.code==='CONNECTION');assert.equal(c.sent.length,1);
 c.ready();assert.equal(c.ctx.bridgeAlive(),true);assert.equal(c.sent.length,1);
});

test('late readiness notifies the app immediately instead of waiting for its polling interval',async()=>{const c=client(),p=c.ctx.prepareBridge();[...c.timers.values()].find(t=>t.ms===12000).f();await assert.rejects(p);c.ready();assert.deepEqual(c.events,['pim-google-ready']);assert.equal(c.ctx.bridgeAlive(),true);});
