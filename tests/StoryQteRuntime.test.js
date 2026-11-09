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
  const lessons=catalog.challenges.filter(d=>d.kind==="training");
  assert.ok(lessons.length>0);
  for(const lesson of lessons){
    const h=harness();
    assert.throws(()=>h.runtime.start(lesson),/Invalid QTE/,lesson.id);
    assert.deepEqual(h.results,[]);
  }
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
test("scored QTEs continue after missed cues and distinguish win, draw and loss",()=>{
  const definition={buttons:["A","Down","Left","Right"],windowMs:100,scoring:{successAt:4,partialAt:3}};
  for(const [mistakes,expected] of [[0,"success"],[1,"partial"],[2,"failure"],[4,"failure"]]){
    const h=harness();h.runtime.start(definition);
    for(let i=0;i<definition.buttons.length;i++){
      if(i<mistakes){if(i%2===0)h.runtime.press("B");else h.step(100);}
      else h.runtime.press(definition.buttons[i]);
    }
    assert.deepEqual(h.results,[expected]);assert.equal(h.views.length,4);
    assert.equal(h.sounds.filter(s=>s==="wrong").length,mistakes);
    h.step(500);assert.deepEqual(h.results,[expected]);
  }
  const h=harness();
  assert.throws(()=>h.runtime.start({...definition,scoring:{successAt:5,partialAt:3}}),/Invalid QTE scoring/);
  assert.throws(()=>h.runtime.start({...definition,scoring:{successAt:3,partialAt:3}}),/Invalid QTE scoring/);
});
test("chicken race's guide-informed approximation allows a win with two correct cues",()=>{
  const definition=catalog.challenges.find(challenge=>challenge.id==="s1.mfsy.chicken-race");
  for(const [hits,expected] of [[0,"failure"],[1,"partial"],[2,"success"],[3,"success"],[4,"success"]]){
    const h=harness();h.runtime.start(definition);
    definition.buttons.forEach((button,index)=>h.runtime.press(index<hits?button:"X"));
    assert.deepEqual(h.results,[expected]);
  }
});
