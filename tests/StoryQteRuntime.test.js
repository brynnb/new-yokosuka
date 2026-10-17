import assert from "node:assert/strict";
import test from "node:test";
import { StoryQteRuntime } from "../play/scripts/StoryQteRuntime.js";
import catalog from "../play/data/story-challenges.json" with { type: "json" };

function harness() {
  let now=0;const timers=new Map(),views=[],sounds=[],results=[];
  const runtime=new StoryQteRuntime({now:()=>now,schedule:(fn,ms)=>{const id={};timers.set(id,{fn,at:now+ms});return id;},cancel:id=>timers.delete(id),
    present:v=>views.push(v),sound:s=>sounds.push(s),finish:r=>results.push(r)});
  const step=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  return {runtime,views,sounds,results,step,timers,setNow:n=>{now=n;}};
}
test("every registered QTE runs locally to one result; training is not a QTE",()=>{
  for(const def of catalog.challenges.filter(d=>d.buttons)) {
    const h=harness();h.runtime.start(def);
    for(const button of def.buttons){h.step(1500);h.runtime.press(button);h.runtime.release(button);}
    assert.deepEqual(h.results,["success"],def.id);h.step(5000);assert.equal(h.results.length,1);
    assert.equal(h.sounds.filter(s=>s==="prompt").length,def.buttons.length);
  }
  assert.equal(catalog.challenges.filter(d=>d.kind==="training").length,2);
});
test("per-step windows and simultaneous chords are independent of network time",()=>{
  const h=harness();h.runtime.start({steps:[{buttons:["A","B"],windowMs:750},{buttons:["Left"],windowMs:3000}]});
  h.runtime.press("A");h.runtime.release("A");h.runtime.press("B");assert.equal(h.views.length,1);
  h.step(600);h.runtime.press("A");assert.equal(h.views.length,2);
  h.step(2900);h.runtime.press("Left");assert.deepEqual(h.results,["success"]);
});
test("wrong input, expired input and late timer callbacks fail once",()=>{
  for(const mode of ["wrong","timer","late-input"]){const h=harness();h.runtime.start({buttons:["A"],windowMs:100});
    if(mode==="wrong")h.runtime.press("B");else if(mode==="timer")h.step(100);else{h.setNow(100);h.runtime.press("A");}
    h.runtime.press("A");h.step(1000);assert.deepEqual(h.results,["failure"]);assert.equal(h.sounds.filter(s=>s==="wrong").length,1);
  }
});
test("cancel/retry discard old deadlines and malformed data fails explicitly",()=>{
  const h=harness();h.runtime.start({buttons:["A"],windowMs:200});const stale=[...h.timers.values()][0].fn;
  h.runtime.stop();h.step(1000);assert.deepEqual(h.results,[]);
  h.runtime.start({buttons:["B"],windowMs:500});stale();h.runtime.press("B");assert.deepEqual(h.results,["success"]);
  assert.throws(()=>h.runtime.start({steps:[{buttons:["A"],windowMs:NaN}]}),/Invalid QTE/);
});
