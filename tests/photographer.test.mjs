import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
function fixture(saved={id:'config'},product={id:'p',fields:{photographer:'Historical name'},baseRevision:'old'}){
 const store=new Map(),writes=[];
 const ctx=vm.createContext({settings:saved,current:product,stamp:()=> 'now',db:{put:async(table,value)=>{writes.push(table);store.set(table+':'+value.id,structuredClone(value));}}});
 vm.runInContext(app.slice(app.indexOf('function currentPhotographer('),app.indexOf('async function addPhotos(')),ctx);
 return {ctx,store,writes};
}
test('explicit photographer selection persists independently of the product and survives reload',async()=>{
 const b=fixture();await b.ctx.changePhotographer(b.ctx.current,'  PHIRAWIT  ');
 assert.equal(b.store.get('settings:config').photographer,'PHIRAWIT');assert.equal(b.ctx.current.fields.photographer,'PHIRAWIT');assert.equal(b.ctx.current.dirty,true);
 const another={id:'other',fields:{photographer:'Someone else'},baseRevision:'r2'};
 const restarted=fixture(b.store.get('settings:config'),another);assert.equal(restarted.ctx.currentPhotographer(),'PHIRAWIT');assert.equal(another.fields.photographer,'Someone else');
});
test('saving drafts, viewing another product, or loading revision data cannot change the remembered name',async()=>{
 const b=fixture({id:'config',photographer:'Selected user'});await b.ctx.saveDraft();
 b.ctx.current={id:'other',fields:{photographer:'Previous revision'},baseRevision:'old'};await b.ctx.saveDraft();
 assert.equal(b.ctx.currentPhotographer(),'Selected user');assert.equal(b.ctx.current.fields.photographer,'Previous revision');assert.deepEqual(b.writes,['products','products']);
});
test('new capture uses the selected operator and only a deliberate change replaces the preference',async()=>{
 const b=fixture({id:'config',photographer:'A'});b.ctx.assignPhotographer(b.ctx.current,b.ctx.currentPhotographer());
 assert.equal(b.ctx.current.fields.photographer,'A');assert.equal(b.ctx.current.pendingRevision,null);
 await b.ctx.changePhotographer(b.ctx.current,'B');assert.equal(b.ctx.currentPhotographer(),'B');assert.equal(b.store.get('settings:config').photographer,'B');
 await b.ctx.changePhotographer(b.ctx.current,'');assert.equal(b.ctx.currentPhotographer(),'');assert.equal(b.ctx.current.fields.photographer,'');
});
