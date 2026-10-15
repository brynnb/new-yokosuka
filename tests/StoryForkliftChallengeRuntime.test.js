import test from "node:test";
import assert from "node:assert/strict";
import {NullEngine,Scene,MeshBuilder} from "@babylonjs/core";
import {StoryForkliftChallengeRuntime} from "../play/scripts/StoryForkliftChallengeRuntime.js";

function harness({loaded=true,floor=true,now}={}){
  const engine=new NullEngine(),scene=new Scene(engine),calls=[];
  if(floor){const mesh=MeshBuilder.CreateGround("floor",{width:50,height:50},scene);mesh.metadata={terrain:true};mesh.computeWorldMatrix(true);}
  const assembly={fleet:new Map(loaded?[["forklift-test",{}]]:[]),cargo:{physics:{entries:new Map(loaded?[["cargo-test",{}]]:[])}},
    mode:{race:{setObservedRace(view){calls.push(["race",view]);},clearObservedRace(){calls.push("race-clear");}},driving:false,activeId:null,enter(){this.driving=true;this.activeId="forklift-test";calls.push("enter");return true;},exit(){this.driving=false;this.activeId=null;calls.push("exit");return true;}}};
  const transaction={releaseMovementLock:()=>calls.push("release")},snapshot={saved:true};
  const runtime=new StoryForkliftChallengeRuntime({scene,now,getForklifts:()=>assembly,getController:()=>({setFirstPerson(){},updateCamera(){}}),capturePlayerState:()=>snapshot,
    restorePlayerState:value=>{assert.equal(value,snapshot);calls.push("restore");},acquireMovementLock:()=>{calls.push("acquire");return()=>calls.push("release-new");},onIntent:(action,token)=>{calls.push([action,token]);return true;}});
  const prompt={id:"test",token:"0123456789abcdef0123456789abcdef",ready:false,delivery:{worldId:"mfsy",dropMin:[-2,-.2,-2],dropMax:[2,2,2],vehicleId:"forklift-test",cargoId:"cargo-test"}};
  return{engine,scene,calls,assembly,runtime,transaction,prompt};
}

test("delivery borrows existing driving and restores only its own camera/control lease",async()=>{
  const h=harness();try{
    await h.runtime.show(h.prompt,h.transaction);assert.equal(h.assembly.mode.driving,false);
    await h.runtime.show({...h.prompt,ready:true},h.transaction);
    await h.runtime.show({...h.prompt,ready:true},h.transaction);
    assert.equal(h.calls.filter(c=>c==="enter").length,1);assert.equal(h.calls.filter(c=>c==="release").length,1);
    h.runtime.update(h.transaction,.21);assert.deepEqual(h.calls.at(-1),["challenge_poll",h.prompt.token]);
    assert.equal(h.runtime.finish({}),false);assert.equal(h.assembly.mode.driving,true);
    assert.equal(h.runtime.finish(h.transaction),true);assert.equal(h.assembly.mode.driving,false);
    assert.equal(h.calls.filter(c=>c==="restore").length,1);assert.equal(h.calls.filter(c=>c==="acquire").length,1);
    assert.equal(h.runtime.finish(h.transaction),false);
  }finally{h.engine.dispose();}
});

test("Story races reuse driving without inventing cargo or a delivery marker",async()=>{
  const h=harness({floor:false});try{
    const prompt={id:"race",token:h.prompt.token,ready:true,race:{vehicleId:"forklift-test",worldId:"ma00race",lap:1,laps:3,checkpoint:0,countdownMs:3000}};
    await h.runtime.show(prompt,h.transaction);
    assert.equal(h.assembly.mode.driving,true);assert.equal(h.runtime.active.marker,undefined);
    await h.runtime.show({...prompt,race:{...prompt.race,checkpoint:2,countdownMs:0}},h.transaction);
    assert.equal(h.calls.filter(c=>c==="enter").length,1);
    assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==="race").at(-1)[1].checkpoint,2);
    h.runtime.finish(h.transaction);
    assert.equal(h.calls.includes("race-clear"),true);assert.equal(h.assembly.mode.driving,false);
  }finally{h.engine.dispose();}
});

test("cancelled delivery loading cannot mount a late vehicle or leak a movement lock",async()=>{
  const h=harness({loaded:false});try{
    const loading=h.runtime.show({...h.prompt,ready:true},h.transaction);
    h.runtime.finish(h.transaction);
    await assert.rejects(loading,error=>error.name==="AbortError");
    assert.equal(h.runtime.active,null);assert.equal(h.assembly.mode.driving,false);
    assert.equal(h.calls.includes("enter"),false);assert.equal(h.calls.includes("acquire"),false);
    assert.equal(h.calls.filter(c=>c==="restore").length,1);
  }finally{h.engine.dispose();}
});

test("a delivery destination without terrain fails and cleans up instead of inventing a floor",async()=>{
  const h=harness({floor:false});try{
    await assert.rejects(h.runtime.show(h.prompt,h.transaction),/no walkable terrain/);
    assert.equal(h.runtime.active,null);assert.equal(h.calls.includes("acquire"),false);
    assert.equal(h.calls.filter(c=>c==="restore").length,1);
  }finally{h.engine.dispose();}
});

test("delivery loading timeout restores the player without mounting or releasing an unowned lock",async()=>{
  let elapsed=0;const h=harness({loaded:false,now:()=>elapsed+=31_000});try{
    await assert.rejects(h.runtime.show({...h.prompt,ready:true},h.transaction),/did not load within 30 seconds/);
    assert.equal(h.runtime.active,null);assert.equal(h.calls.includes("enter"),false);assert.equal(h.calls.includes("acquire"),false);
    assert.equal(h.calls.filter(c=>c==="restore").length,1);
  }finally{h.engine.dispose();}
});

test("a cancelled loading callback cannot end a newer delivery attempt",async()=>{
  const h=harness({loaded:false});try{
    const old=h.runtime.show({...h.prompt,ready:true},h.transaction);
    h.runtime.finish(h.transaction);
    h.assembly.fleet.set("forklift-test",{});h.assembly.cargo.physics.entries.set("cargo-test",{});
    const next={releaseMovementLock:()=>{}};
    await h.runtime.show({...h.prompt,token:"ffffffffffffffffffffffffffffffff",ready:true},next);
    await assert.rejects(old,error=>error.name==="AbortError");
    assert.equal(h.runtime.active.transaction,next);assert.equal(h.assembly.mode.driving,true);
    h.runtime.finish(next);assert.equal(h.assembly.mode.driving,false);
  }finally{h.engine.dispose();}
});
