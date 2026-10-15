import test from "node:test";
import assert from "node:assert/strict";
import { AuthoredSceneStagingRuntime } from "../play/scripts/AuthoredSceneStagingRuntime.js";

function harness() {
  const calls = [];
  const root={enabled:true,setEnabled(value){this.enabled=value;}};
  let prepare = async () => {};
  const runtime = new AuthoredSceneStagingRuntime({
    actors: {
      prepare: (...args) => prepare(...args),
      begin: () => calls.push("actors-begin"),
      applyTransform: () => true,
      activeActor: () => ({ model: {},root }),
      end: () => (root.enabled=true,calls.push("actors-end"), true),
    },
    camera: {
      begin: () => calls.push("camera-begin"),
      apply: () => true,
      end: () => (calls.push("camera-end"), true),
    },
    motionRuntime: { loadNamedSelections: async () => {}, applyNamed: () => true },
    capturePlayerState: () => ({ position: [1, 2, 3], cameraYaw: 4 }),
    restorePlayerState: snapshot => (calls.push(snapshot), true),
  });
  const transaction = { area: "DBHB" };
  const scene = { id: "bar", area: "DBHB", actors: [{ tag: "AKIR", motion: { bank: "free", name: "stand" } }],
    camera: { positionX: 0, positionY: 1, positionZ: 2, targetX: 0, targetY: 1, targetZ: 0, roll: 0, perspective: 60 } };
  return { runtime, transaction, scene, calls,root, deferPrepare: fn => { prepare = fn; } };
}

test("standalone tableau props reuse scene-object presentation and dispose on release",async()=>{
  const h=harness(),calls=[];h.scene.sceneObjects={BIK1:{model:"bike"}};
  h.runtime.createSceneObjects=definitions=>{
    assert.equal(definitions,h.scene.sceneObjects);
    return{load:async roots=>{assert.deepEqual(roots,[]);calls.push("load");},prepareActivity:value=>calls.push(value),clear:()=>calls.push("clear")};
  };
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.deepEqual(calls,["load",{activityId:h.scene.id,nativeSceneObjectStates:[{actorTag:"BIK1",presented:true}]}]);
  h.runtime.cancel(h.transaction);assert.equal(calls.at(-1),"clear");
});

test("cancelled standalone loading cannot acquire underneath another tableau",async()=>{
  const h=harness();h.scene.sceneObjects={BIK1:{model:"bike"}};let resolve,clears=0;
  h.runtime.createSceneObjects=()=>({load:()=>new Promise(r=>resolve=r),prepareActivity:()=>assert.fail("cancelled props acquired"),clear:()=>clears++});
  const old=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.cancel(h.transaction);
  const scene={...h.scene,id:"new",sceneObjects:undefined},tx={area:h.transaction.area};
  await h.runtime.play({kind:"scene-staging-start",scene},tx);const owner=h.runtime.active;
  resolve();await assert.rejects(old,{name:"AbortError"});assert.equal(clears,2);assert.equal(h.runtime.active,owner);
  h.runtime.cancel(tx);
});

function movingScene(scene,id="moving"){
  const track=(values,delta)=>({channels:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{times:[0,1],values:[value,value+(delta[key]||0)],tangents:[delta[key]||0,delta[key]||0]}]))});
  const pose={x:0,y:0,z:0,rotationX:0,rotationY:0,rotationZ:0};
  return{...scene,id,continuationGroup:"chase",durationSeconds:1,
    actors:[{...scene.actors[0],pose,movement:track(pose,{x:4}),endMotion:{bank:"free",name:"stand",loop:true}}],
    cameraTrack:track(scene.camera,{positionX:4,targetX:4})};
}

test("moving tableaux reuse native curve evaluation and stop at their endpoint",async()=>{
  const h=harness(),poses=[],cameras=[],motions=[];h.scene=movingScene(h.scene);
  h.runtime.actors.applyTransform=(_owner,_tag,pose)=>(poses.push(pose),true);
  h.runtime.camera.apply=(_owner,camera)=>(cameras.push(camera),true);
  h.runtime.motionRuntime.applyNamed=(_model,motion)=>(motions.push(motion.name),true);
  const pending=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);await new Promise(r=>setImmediate(r));
  h.runtime.update(h.transaction,.5);assert.equal(poses.at(-1).x,2);assert.equal(cameras.at(-1).positionX,2);
  h.runtime.update(h.transaction,.5);await pending;assert.equal(poses.at(-1).x,4);assert.equal(motions.at(-1),"stand");
  h.runtime.update(h.transaction,2);assert.equal(poses.at(-1).x,4);h.runtime.cancel(h.transaction);
});

test("scene beats retain one actor/camera lease and restore only after the final beat",async()=>{
  const h=harness();const first=movingScene(h.scene),next={...movingScene(h.scene,"next"),continuesPrevious:true};
  let pending=h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);await new Promise(r=>setImmediate(r));h.runtime.update(h.transaction,1);await pending;
  const owner=h.runtime.active;
  pending=h.runtime.play({kind:"scene-staging-transition",scene:next},h.transaction);await new Promise(r=>setImmediate(r));
  assert.equal(h.runtime.active,owner);assert.equal(h.calls.filter(c=>c==="actors-begin").length,1);assert.equal(h.calls.includes("camera-end"),false);
  h.runtime.update(h.transaction,1);await pending;
  assert.equal(await h.runtime.play({kind:"scene-staging-finish",scene:first},h.transaction),false);
  assert.equal(await h.runtime.play({kind:"scene-staging-finish",scene:next},h.transaction),true);
  assert.equal(h.calls.filter(c=>c==="camera-end").length,1);assert.equal(h.calls.filter(c=>c==="actors-end").length,1);
});

test("moving props retain one resource lease across chase beats and stop at the curve endpoint",async()=>{
  const h=harness(),calls=[],poses=[];
  const first=movingScene(h.scene),next=movingScene(h.scene,"next");
  for(const scene of [first,next]){
    scene.sceneObjects={BIK1:{model:"bike"}};
    scene.sceneObjectTracks={BIK1:structuredClone(scene.actors[0].movement)};
  }
  h.runtime.createSceneObjects=()=>{
    calls.push("create");return{load:async()=>calls.push("load"),prepareActivity:()=>calls.push("prepare"),
      begin:(_owner,tags)=>calls.push(tags),applyTransform:(owner,tag,pose)=>(assert.equal(owner,h.runtime.active),assert.equal(tag,"BIK1"),poses.push(pose),true),
      clear:()=>calls.push("clear")};
  };
  let pending=h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.update(h.transaction,.5);assert.equal(poses.at(-1).x,2);
  h.runtime.update(h.transaction,1);await pending;assert.equal(poses.at(-1).x,4);
  const owner=h.runtime.active;
  pending=h.runtime.play({kind:"scene-staging-transition",scene:next},h.transaction);
  await new Promise(r=>setImmediate(r));assert.equal(h.runtime.active,owner);
  h.runtime.update(h.transaction,1);await pending;
  assert.deepEqual(calls,["create","load","prepare",["BIK1"]]);
  assert.equal(await h.runtime.play({kind:"scene-staging-transition",scene:{...next,id:"swapped",sceneObjects:{BIK1:{model:"other-bike"}}}},h.transaction),false);
  h.runtime.cancel(h.transaction);assert.equal(calls.at(-1),"clear");
});

test("unknown or malformed prop curves fail before resource acquisition",async()=>{
  for(const broken of ["unknown","malformed"]){
    const h=harness(),scene=movingScene(h.scene);scene.sceneObjects={BIK1:{model:"bike"}};
    scene.sceneObjectTracks={[broken==="unknown"?"NONE":"BIK1"]:structuredClone(scene.actors[0].movement)};
    if(broken==="malformed")scene.sceneObjectTracks.BIK1.channels.x.times[1]=Infinity;
    h.runtime.createSceneObjects=()=>assert.fail("invalid props acquired");
    await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene},h.transaction),/staged (object|track)/);
    assert.equal(h.runtime.active,null);
  }
});

test("a cancelled moving-prop transition cannot reacquire or clear a newer scene",async()=>{
  const h=harness(),first=movingScene(h.scene),clears=[];
  first.sceneObjects={BIK1:{model:"bike"}};first.sceneObjectTracks={BIK1:first.actors[0].movement};
  h.runtime.createSceneObjects=()=>({load:async()=>{},prepareActivity:()=>{},begin:()=>{},applyTransform:()=>true,clear:()=>clears.push("old")});
  let pending=h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.update(h.transaction,1);await pending;
  let resolve;h.runtime.motionRuntime.loadNamedSelections=()=>new Promise(r=>resolve=r);
  pending=h.runtime.play({kind:"scene-staging-transition",scene:{...first,id:"next"}},h.transaction);
  h.runtime.cancel(h.transaction);h.runtime.motionRuntime.loadNamedSelections=async()=>{};
  const tx={area:h.transaction.area};await h.runtime.play({kind:"scene-staging-start",scene:h.scene},tx);
  const owner=h.runtime.active;resolve();await assert.rejects(pending,{name:"AbortError"});
  assert.equal(h.runtime.active,owner);assert.deepEqual(clears,["old"]);h.runtime.cancel(tx);
});

test("malformed movement and incompatible scene transitions fail instead of inventing a pose",async()=>{
  const h=harness(),scene=movingScene(h.scene);scene.actors[0].movement.channels.x.values[1]=NaN;
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene},h.transaction),/Invalid staged track/);assert.equal(h.runtime.active,null);
  const first=movingScene(h.scene);const pending=h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);await new Promise(r=>setImmediate(r));h.runtime.update(h.transaction,1);await pending;
  assert.equal(await h.runtime.play({kind:"scene-staging-transition",scene:{...first,id:"other",continuationGroup:"other"}},h.transaction),false);
  assert.equal(h.runtime.active.scene,first);h.runtime.cancel(h.transaction);
});

test("cancelled transition preparation cannot restore over a newer scene",async()=>{
  const h=harness(),first=movingScene(h.scene);let pending=h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);await new Promise(r=>setImmediate(r));h.runtime.update(h.transaction,1);await pending;
  let resolve;h.runtime.motionRuntime.loadNamedSelections=()=>new Promise(r=>resolve=r);
  pending=h.runtime.play({kind:"scene-staging-transition",scene:movingScene(h.scene,"next")},h.transaction);
  h.runtime.cancel(h.transaction);h.runtime.motionRuntime.loadNamedSelections=async()=>{};
  const tx={area:"DBHB"};await h.runtime.play({kind:"scene-staging-start",scene:h.scene},tx);const before=[...h.calls];
  resolve();await assert.rejects(pending,{name:"AbortError"});assert.deepEqual(h.calls,before);assert.equal(h.runtime.active.transaction,tx);h.runtime.cancel(tx);
});

test("a tableau restores temporary world objects after cancellation and failed presentation", async () => {
  const h = harness();
  const root = {position: {clone: () => ({x: 1}), copyFrom: () => {}},
    enabled: true, isEnabled() {return this.enabled;}, setEnabled(v) {this.enabled = v;}, computeWorldMatrix() {},
    _runtimePlacementRecord: {runtime: {objectTag: "SCRO"}}};
  h.runtime.currentMeshes = () => [root];
  h.scene.objectTransforms = [{object: "SCRO", visible: false}];
  await h.runtime.play({kind: "scene-staging-start", scene: h.scene}, h.transaction);
  assert.equal(root.enabled, false);
  h.runtime.cancel(h.transaction); assert.equal(root.enabled, true);
  h.runtime.camera.apply = () => false;
  await assert.rejects(h.runtime.play({kind: "scene-staging-start", scene: h.scene}, h.transaction), /Cannot present/);
  assert.equal(root.enabled, true);
});

test("authored tableau retains ownership across dialogue/QTE and releases exact pose", async () => {
  const h = harness();
  assert.equal(await h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, h.transaction), true);
  assert.equal(h.runtime.update(h.transaction, 1), true);
  assert.equal(h.runtime.active.elapsed, 1);
  assert.equal(await h.runtime.play({ kind: "scene-staging-finish", scene: h.scene }, {}), false);
  assert.equal(await h.runtime.play({ kind: "scene-staging-finish", scene: h.scene }, h.transaction), true);
  assert.equal(h.runtime.active, null);
  assert.deepEqual(h.calls, ["actors-begin", "camera-begin", "camera-end", "actors-end", { position: [1, 2, 3], cameraYaw: 4 }]);
});

test("cancelled preparation cannot acquire or restore over a newer tableau", async () => {
  const h = harness();
  let resolve;
  h.deferPrepare(() => new Promise(r => { resolve = r; }));
  const old = h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, h.transaction);
  assert.equal(h.runtime.cancel(h.transaction), true);
  h.deferPrepare(async () => {});
  const next = { area: "DBHB" };
  assert.equal(await h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, next), true);
  const callsBefore = [...h.calls];
  resolve();
  await assert.rejects(old, { name: "AbortError" });
  assert.deepEqual(h.calls, callsBefore);
  assert.equal(h.runtime.active.transaction, next);
  h.runtime.cancel(next);
});

test("failed preparation is observable and retryable without acquiring actors/camera", async () => {
  const h = harness();
  h.deferPrepare(async () => { throw new Error("missing model"); });
  await assert.rejects(h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, h.transaction), /missing model/);
  assert.equal(h.runtime.active, null);
  assert.equal(h.calls.includes("actors-begin"), false);
  h.deferPrepare(async () => {});
  assert.equal(await h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, h.transaction), true);
  h.runtime.cancel(h.transaction);
});

test("out-of-shot residents remain owned and hidden until scene cleanup",async()=>{
  const h=harness();h.scene.actors[0].presented=false;
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.equal(h.root.enabled,false);assert.equal(h.runtime.active.actorsBegun,true);
  h.runtime.update(h.transaction,.1);assert.equal(h.root.enabled,false);
  h.runtime.cancel(h.transaction);assert.equal(h.root.enabled,true);
});

test("a timed tableau acknowledges only its duration and releases owned props on cancellation",async()=>{
  for(const cancel of [false,true]){
    const h=harness(),frames=[];let cleared=0,signal;
    h.scene.durationSeconds=2;h.scene.attachedObjects={BALL:{}};
    h.runtime.createAttachedObjects=(_defs,_resolve,abortSignal)=>(signal=abortSignal,{
      load:async()=>{},beginActivity:()=>true,update:frame=>(frames.push(frame),true),clear:()=>cleared++,
    });
    let settled=false;
    const playing=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction).then(()=>settled=true);
    await new Promise(r=>setImmediate(r));
    assert.equal(settled,false);h.runtime.update(h.transaction,1);assert.equal(settled,false);
    if(cancel){h.runtime.cancel(h.transaction);await assert.rejects(playing,{name:"AbortError"});}
    else{h.runtime.update(h.transaction,1);await playing;assert.equal(settled,true);h.runtime.cancel(h.transaction);}
    assert.deepEqual(frames,cancel?[0,30]:[0,30,60]);assert.equal(cleared,1);assert.equal(signal.aborted,true);
  }
});

test("a cancelled prop loader cannot acquire beneath the next tableau",async()=>{
  const h=harness();let loaded,cleared=0;
  h.scene.attachedObjects={BALL:{}};
  h.runtime.createAttachedObjects=()=>({load:()=>new Promise(r=>loaded=r),clear:()=>cleared++});
  const old=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.cancel(h.transaction);
  const scene={...h.scene,id:"next",attachedObjects:undefined},next={area:"DBHB"};
  await h.runtime.play({kind:"scene-staging-start",scene},next);
  const before=[...h.calls];loaded();await assert.rejects(old,{name:"AbortError"});
  assert.deepEqual(h.calls,before);assert.equal(h.runtime.active.transaction,next);assert.equal(cleared,2);
  h.runtime.cancel(next);
});

test("a motion-timed scene waits for its longest loaded clip, not a guessed short delay",async()=>{
  const h=harness();h.scene.waitForMotions=true;h.scene.actors[0].motion.loop=false;
  h.runtime.motionRuntime.namedDurationSeconds=()=>418/30;
  let finished=false;
  const pending=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction).then(()=>{finished=true;});
  await new Promise(r=>setImmediate(r));
  h.runtime.update(h.transaction,4);await Promise.resolve();assert.equal(finished,false);
  h.runtime.update(h.transaction,418/30-4);await pending;assert.equal(finished,true);
  h.runtime.release(h.transaction);
  h.scene.actors[0].motion.loop=true;
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/non-looping motions/);
});
