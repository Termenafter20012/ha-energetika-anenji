import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class{};
globalThis.customElements={get:()=>true};
globalThis.window={customCards:[]};
const {cleanHistory,buildStepPath}=await import('../energetika-history.js');
const {formatRuntime}=await import('../energetika-card.js');
const start=Date.parse('2026-10-15T14:00:00Z');
const row=(seconds,state)=>({state:String(state),last_changed:new Date(start+seconds*1000).toISOString()});

test('65535 W shutdown plateau becomes a gap; real load steps remain',()=>{
  const result=cleanHistory([row(0,500),row(10,65535),row(20,65000),row(30,'unavailable'),row(40,0),row(50,4000),row(60,7000)],0,8400,start,start+70000);
  assert.equal(result.rejected,2);
  assert.deepEqual(result.points.map(p=>p.v),[500,null,null,null,0,4000,7000]);
  const path=buildStepPath(result.points,start,start+70000,0,8000);
  assert.equal((path.match(/M/g)||[]).length,2,'do not connect across the invalid interval');
  assert.ok(!path.includes('NaN'));
});
test('negative export remains valid and unknown is not zero',()=>{
  assert.deepEqual(cleanHistory([row(0,-1000),row(1,'unknown'),row(2,0)],-11000,11000,start,start+3000).points.map(p=>p.v),[-1000,null,0]);
});
test('empty history and bad timestamps are handled',()=>{
  assert.deepEqual(cleanHistory([{state:'500',last_changed:'invalid'}],0,8400,start,start+1000).points,[]);
});
test('timer keeps reserve and shows readable remaining time',()=>{
  assert.equal(formatRuntime((2560-512)/500*60),'4 ч 05 мин');
  assert.equal(formatRuntime(0),'0 мин');
  assert.equal(formatRuntime(NaN),'—');
});
