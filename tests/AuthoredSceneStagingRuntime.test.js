import test from "node:test";
import assert from "node:assert/strict";
import { NativeStoryScreenFade } from "../play/scripts/NativeStoryScreenFade.js";
import { AuthoredSceneStagingRuntime } from "../play/scripts/AuthoredSceneStagingRuntime.js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import scenes from "../play/data/authored-story-scenes.json" with {type:"json"};

test("Yong and Wu's staged placements retain the original conversation coordinates and facing", {
  skip: !existsSync(scenes.scenes.find(scene => scene.id === "s1.dbyo.yong-wu").nativeSource.path)
    && "requires locally extracted original CM_D000.BIN",
}, () => {
  const scene = scenes.scenes.find(scene => scene.id === "s1.dbyo.yong-wu");
  const source = readFileSync(scene.nativeSource.path);
  assert.equal(createHash("sha256").update(source).digest("hex"), scene.nativeSource.sha256);
  assert.deepEqual(scene.actors.map(actor => actor.tag), ["AKIR", "ECHO", "GRKN"]);
  assert.equal(scene.actors[0].presented, false, "Ryo speaks from the camera side without inventing a source pose");
  for (const actor of scene.actors.filter(actor => actor.tag !== "AKIR")) {
    const offset = scene.nativeSource.placements[actor.tag];
    assert.equal(source.readUInt16LE(offset), 3, "original placement operation");
    assert.deepEqual([actor.pose.x, actor.pose.y, actor.pose.z], [4,8,12].map(i => source.readFloatLE(offset+i)));
    assert.equal(actor.pose.rotationY, source.readInt16LE(offset+16)*360/65536);
  }
});

function harness() {
  const calls = [];
  const root={enabled:true,setEnabled(value){this.enabled=value;}};
  let prepare = async () => {};
  const runtime = new AuthoredSceneStagingRuntime({
    createFaces: () => ({
      prepare: async () => {}, begin: () => true, apply: () => true, clear: () => {},
      play: (_owner, command) => { calls.push(command); return true; },
    }),
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
    acquireEnvironmentIsolation: () => () => calls.push("environment-release"),
    acquireActorIsolation: (_owner,tags) => (calls.push(["retain",...tags]),() => calls.push("isolation-release")),
  });
  const transaction = { area: "DBHB" };
  const scene = { id: "bar", area: "DBHB", actors: [{ tag: "AKIR", motion: { bank: "free", name: "stand" } }],
    camera: { positionX: 0, positionY: 1, positionZ: 2, targetX: 0, targetY: 1, targetZ: 0, roll: 0, perspective: 60 } };
  return { runtime, transaction, scene, calls,root, deferPrepare: fn => { prepare = fn; } };
}

test("room-camera staging borrows the camera and releases it with the saved inspect pose", async () => {
  const h = harness();
  delete h.scene.camera;
  h.scene.useGameplayCamera = true;
  const updates = [];
  h.runtime.updateGameplayCamera = (delta, entering) => updates.push({ delta, entering });
  h.runtime.camera.apply = () => assert.fail("unexpected authored shot");
  await h.runtime.play({ kind: "scene-staging-start", scene: h.scene }, h.transaction);
  h.runtime.update(h.transaction, 0.2);
  assert.deepEqual(updates, [{ delta: 0, entering: true }, { delta: 0.2, entering: false }]);
  assert.equal(h.runtime.cancel(h.transaction), true);
  assert.equal(h.calls.filter(call => call === "camera-begin").length, 1);
  assert.equal(h.calls.filter(call => call === "camera-end").length, 1);
  assert.ok(h.calls.some(call => call?.cameraYaw === 4));
});

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

test("authored phone borrows the exact receiver after actor posing and restores it on cancel",async()=>{
  const h=harness(),calls=[];h.scene.telephoneReceiver="JOMO_TEL_";
  h.runtime.motionRuntime.applyNamed=()=>{calls.push("pose");return true;};
  h.runtime.createTelephoneReceiver=resolve=>({
    attach:(binding,owner)=>(assert.equal(resolve("AKIR").root,h.root),assert.equal(binding.objectTag,"TEL_"),calls.push("attach"),true),
    update:()=> (calls.push("update"),true),
    detach:()=> (calls.push("detach"),true),
  });
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.deepEqual(calls,["pose","attach"]);
  assert.equal(h.runtime.update(h.transaction,.1),true);
  assert.deepEqual(calls,["pose","attach","pose","update"]);
  assert.equal(h.runtime.cancel(h.transaction),true);assert.equal(calls.at(-1),"detach");
});

test("failed authored receiver binding rolls back instead of silently omitting it",async()=>{
  const h=harness();h.scene.telephoneReceiver="JOMO_TEL_";
  h.runtime.createTelephoneReceiver=()=>({attach:()=>false,detach:()=>assert.fail("not attached")});
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/Cannot present/);
  assert.equal(h.runtime.active,null);assert.ok(h.calls.includes("actors-end"));assert.ok(h.calls.includes("camera-end"));
});

test("replacement tableaux isolate resident roots and restore their prior visibility on cancellation",async()=>{
  const h=harness(),makeRoot=(enabled,metadata={})=>({enabled,metadata,isEnabled(){return this.enabled;},setEnabled(value){this.enabled=value;}});
  const visible=makeRoot(true),hidden=makeRoot(false),cast=makeRoot(true,{scheduledActorInstanceId:"cast"});
  h.runtime.currentMeshes=()=>[visible,hidden,cast];h.scene.isolateResidentWorld=true;
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.equal(visible.enabled,false);assert.equal(hidden.enabled,false);assert.equal(cast.enabled,true);
  assert.equal(h.runtime.cancel(h.transaction),true);
  assert.equal(visible.enabled,true);assert.equal(hidden.enabled,false);assert.equal(cast.enabled,true);
  assert.deepEqual(h.calls.find(c=>Array.isArray(c)),["retain","AKIR"]);
  assert.ok(h.calls.includes("isolation-release"));assert.ok(h.calls.includes("environment-release"));
});

test("replacement tableau restores resident roots after camera setup failure",async()=>{
  const h=harness(),root={enabled:true,isEnabled(){return this.enabled;},setEnabled(value){this.enabled=value;}};
  h.runtime.currentMeshes=()=>[root];h.scene.isolateResidentWorld=true;
  h.runtime.camera.apply=()=>false;
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/Cannot present/);
  assert.equal(root.enabled,true);assert.equal(h.runtime.active,null);
  assert.ok(h.calls.includes("isolation-release"));assert.ok(h.calls.includes("environment-release"));
});

test("failed actor isolation releases the already acquired environment",async()=>{
  const h=harness();h.runtime.currentMeshes=()=>[];h.scene.isolateResidentWorld=true;
  h.runtime.acquireActorIsolation=()=>{throw Error("actor isolation failed");};
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/actor isolation failed/);
  assert.ok(h.calls.includes("environment-release"));assert.equal(h.runtime.active,null);
});

test("actor-only isolation leaves the world visible and releases on cancellation",async()=>{
  const h=harness(),root={enabled:true,isEnabled(){return this.enabled;},setEnabled(value){this.enabled=value;}};
  h.runtime.currentMeshes=()=>[root];h.scene.isolateScheduledActors=true;
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.equal(root.enabled,true);assert.deepEqual(h.calls.find(c=>Array.isArray(c)),["retain","AKIR"]);
  h.runtime.cancel(h.transaction);assert.ok(h.calls.includes("isolation-release"));assert.ok(!h.calls.includes("environment-release"));
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

test("archive-local tableau actors use their own lease and are disposed on release",async()=>{
  const h=harness(),calls=[];
  h.scene.packageActors={CATM:{modelCode:"KC1_M"}};
  h.runtime.createActorSet=definitions=>{
    assert.equal(definitions,h.scene.packageActors);
    return {actors:{...h.runtime.actors,begin:()=>(calls.push("begin"),true),end:()=>(calls.push("end"),true)},
      load:async()=>calls.push("load"),clear:()=>calls.push("clear")};
  };
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.deepEqual(calls,["load","begin"]);
  h.runtime.cancel(h.transaction);assert.deepEqual(calls,["load","begin","end","clear"]);
});

test("archive-owned actors and actor isolation hold distinct suppression leases",async()=>{
  const h=harness(),leases=new Set();h.scene.packageActors={CATM:{modelCode:"KC1_M"}};h.scene.isolateScheduledActors=true;
  const acquire=owner=>{if(leases.has(owner))throw Error("duplicate owner");leases.add(owner);return()=>leases.delete(owner);};
  h.runtime.acquireActorIsolation=owner=>acquire(owner);
  h.runtime.createActorSet=()=>{let release;return{actors:{...h.runtime.actors,begin:owner=>(release=acquire(owner),true),end:()=>(release(),true)},load:async()=>{},clear:()=>{}};};
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.equal(leases.size,2);h.runtime.cancel(h.transaction);assert.equal(leases.size,0);
});

test("a cancelled archive actor load cannot acquire or clear the next scene",async()=>{
  const h=harness();h.scene.packageActors={CATM:{modelCode:"KC1_M"}};let resolve,clears=0;
  h.runtime.createActorSet=()=>({actors:h.runtime.actors,load:()=>new Promise(r=>resolve=r),clear:()=>clears++});
  const old=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.cancel(h.transaction);
  const scene={...h.scene,id:"new",packageActors:undefined},tx={area:h.transaction.area};
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

test("retained tableaux can explicitly reveal a previously hidden actor",async()=>{
  const h=harness(),first={...h.scene,continuationGroup:"fight",actors:[{...h.scene.actors[0],presented:false}]};
  await h.runtime.play({kind:"scene-staging-start",scene:first},h.transaction);assert.equal(h.root.enabled,false);
  const next={...first,id:"next",continuesPrevious:true,actors:[{...first.actors[0],presented:true}]};
  await h.runtime.play({kind:"scene-staging-transition",scene:next},h.transaction);assert.equal(h.root.enabled,true);
  assert.equal(h.calls.filter(c=>c==="actors-begin").length,1);h.runtime.cancel(h.transaction);
  assert.equal(h.calls.filter(c=>c==="actors-end").length,1);
});

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

test("interactive staged motion continues after start and is released on cancellation",async()=>{
  const h=harness(),poses=[];h.scene={...movingScene(h.scene),waitForMotionCompletion:false};
  h.runtime.actors.applyTransform=(_owner,_tag,pose)=>(poses.push(pose),true);
  assert.equal(await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),true);
  assert.ok(h.runtime.active);
  h.runtime.update(h.transaction,.5);assert.equal(poses.at(-1).x,2);
  h.runtime.update(h.transaction,2);assert.equal(poses.at(-1).x,4);
  h.runtime.cancel(h.transaction);assert.equal(h.runtime.active,null);
  assert.equal(h.calls.filter(c=>c==="camera-end").length,1);
  assert.equal(h.calls.filter(c=>c==="actors-end").length,1);
});

test("nonblocking staged motion requires a finite duration",async()=>{
  const h=harness();h.scene.waitForMotionCompletion=false;
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/Invalid motion completion option/);
  assert.equal(h.runtime.active,null);
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

test("unsubtitled stage sounds follow native cue times and release only their own playback", async () => {
  const h = harness(), played = [], stopped = [];
  h.scene = {...h.scene, durationSeconds: 4, waitForMotionCompletion: false, soundCues: [
    {asset:"public/audio/world/mai-alley/E1036A009.wav", atSeconds:.5},
    {asset:"public/audio/world/mai-alley/E1036A008.wav", atSeconds:2},
  ]};
  h.runtime.dialogueAudio = {
    playOneShot(asset) { const audio = {asset}; played.push(audio); return audio; },
    stopOneShot(audio) { stopped.push(audio); },
  };
  await h.runtime.play({kind:"scene-staging-start", scene:h.scene},h.transaction);
  h.runtime.update(h.transaction,.49);
  assert.deepEqual(played,[]);
  h.runtime.update(h.transaction,.01);
  h.runtime.update(h.transaction,1.5);
  h.runtime.update(h.transaction,.01);
  assert.deepEqual(played.map(a=>a.asset),h.scene.soundCues.map(c=>c.asset));
  h.runtime.cancel(h.transaction);
  assert.deepEqual(stopped,played);
  h.scene.soundCues.reverse();
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/Invalid staged sound cues/);
});

test("native motion changes preload each clip, use authored offsets and retain the last pose", async () => {
  const h=harness(), selections=[], poses=[];
  const walk={bank:"maiAlley",name:"walk",loop:false};
  h.scene={...movingScene(h.scene),waitForMotionCompletion:false};
  delete h.scene.actors[0].endMotion;
  h.scene.actors[0].motionCues=[{atSeconds:.25,startSeconds:.5,motion:walk}];
  h.runtime.motionRuntime.loadNamedSelections=async clips=>selections.push(...clips);
  h.runtime.motionRuntime.applyNamed=(_model,clip,seconds)=>(poses.push([clip.name,seconds]),true);
  assert.equal(await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),true);
  assert.deepEqual(selections.map(x=>x.name),["stand","walk"]);
  h.runtime.update(h.transaction,.25);
  assert.deepEqual(poses.at(-1),["walk",.5]);
  h.runtime.update(h.transaction,.75);
  assert.deepEqual(poses.at(-1),["walk",1.25]);
  h.runtime.cancel(h.transaction);
  h.scene.actors[0].motionCues.push({atSeconds:.2,motion:walk});
  await assert.rejects(h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction),/Invalid staged motion cues/);
});

test("a voiced film can retain its last shot after dialogue and release on cancellation", async () => {
  for (const cancel of [false, true]) {
    const h = harness();
    const scene = { ...movingScene(h.scene), waitForMotionCompletion: false, playThroughFinish: true };
    await h.runtime.play({ kind: "scene-staging-start", scene }, h.transaction);
    h.runtime.update(h.transaction, 0.25);
    const finish = h.runtime.play({ kind: "scene-staging-finish", scene }, h.transaction);
    assert.ok(h.runtime.active);
    if (cancel) {
      h.runtime.release(h.transaction);
      await assert.rejects(finish, { name: "AbortError" });
    } else {
      h.runtime.update(h.transaction, 0.75);
      assert.equal(await finish, true);
    }
    assert.equal(h.runtime.active, null);
  }
});

test("motion offsets and nonverbal lead use the active shot clock and release only its audio", async () => {
  const h=harness(), played=[], times=[], released=[];
  h.runtime.dialogueAudio={playOneShot:path=>(played.push(path),{path}),stopOneShot:audio=>released.push(audio.path)};
  h.runtime.motionRuntime.applyNamed=(_model,_motion,time)=>(times.push(time),true);
  h.scene.actors[0].motionStartSeconds=10/30;
  h.scene.durationSeconds=4;
  h.scene.waitForMotionCompletion=false;
  const asset="public/audio/world/dobuita-drunkard/E1005B011.wav";
  h.scene.voiceCue={asset,atSeconds:22/30,dialogueAtSeconds:87/30};
  let returned=false;
  const start=h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction).then(value=>(returned=true,value));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(times[0],10/30);
  h.runtime.update(h.transaction,.6);
  assert.deepEqual(played,[]);
  h.runtime.update(h.transaction,.2);
  assert.deepEqual(played,[asset]);
  assert.equal(returned,false);
  h.runtime.update(h.transaction,2.2);
  assert.equal(await start,true);
  assert.deepEqual(played,[asset]);
  assert.equal(h.runtime.cancel(h.transaction),true);
  assert.deepEqual(released,[asset]);
  assert.equal(h.runtime.active,null);
});

test("the next voiced line can join a running motion at its authored time", async () => {
  const h = harness();
  const scene = { ...movingScene(h.scene), waitForMotionCompletion: false, playThroughFinish: true, dialogueCueSeconds: 0.6 };
  await h.runtime.play({ kind: "scene-staging-start", scene }, h.transaction);
  const owner = h.runtime.active;
  const cue = h.runtime.play({ kind: "scene-staging-dialogue-cue", scene }, h.transaction);
  h.runtime.update(h.transaction, 0.59);
  assert.equal(owner.resolveAt, 0.6);
  assert.ok(owner.resolve);
  h.runtime.update(h.transaction, 0.02);
  assert.equal(await cue, true);
  assert.equal(h.runtime.active, owner);
  const finish = h.runtime.play({kind:"scene-staging-finish",scene},h.transaction);
  h.runtime.update(h.transaction, 0.4);
  assert.equal(await finish, true);
  assert.equal(h.runtime.active, null);
});

test("a staged wrist overlay loads and plays over locomotion until the next full-body cue",async()=>{
  const h=harness(),baseMotion={bank:"free",name:"walk",loop:true,movement:true};
  const a=h.scene.actors[0],cueMotion={bank:"bent",name:"set-down"};
  a.baseMotion=baseMotion;
  a.motionCues=[{atSeconds:1,motion:cueMotion}];
  h.scene.durationSeconds=2;
  h.scene.waitForMotionCompletion=false;
  let selections;
  const applied=[];
  h.runtime.motionRuntime.loadNamedSelections=async value=>{selections=value};
  h.runtime.motionRuntime.applyNamed=(_model,motion,_elapsed,layers)=>{applied.push({motion,layers});return true};
  await h.runtime.play({kind:"scene-staging-start",scene:h.scene},h.transaction);
  assert.deepEqual(selections,[a.motion,baseMotion,cueMotion]);
  assert.deepEqual(applied.at(-1),{motion:a.motion,layers:{baseSelection:baseMotion,baseProvidesTimeline:true}});
  h.runtime.update(h.transaction,1.2);
  assert.deepEqual(applied.at(-1),{motion:cueMotion,layers:undefined});
  h.runtime.cancel(h.transaction);
});

test("Goro's shipped introduction starts, plays the four voices and respects the source run rate", async () => {
  const {runtime,transaction}=harness();
  const scene=JSON.parse(readFileSync("play/data/story-goro-guard.generated.json")).scenes[0];
  transaction.area=scene.area;
  runtime.createActorSet=()=>({load:async()=>{},actors:runtime.actors,clear(){}});
  const goroModel={modelCode:"KMB_L"},ryoModel={modelCode:"YKC_M"};
  runtime.actors.activeActor=tag=>({model:tag==="GORO"?goroModel:ryoModel});
  const faceCalls=[];
  runtime.createFaces=(definitions,actors,signal)=>{
    assert.equal(definitions.GORO.bodyModelCode,goroModel.modelCode);
    assert.equal(actors,runtime.actors);
    assert.equal(signal.aborted,false);
    return {prepare:async({actors})=>faceCalls.push(["prepare",...actors]),
      begin:(_owner,tags)=>faceCalls.push(["begin",...tags]),clear:()=>{faceCalls.push(["clear"]);},
      apply:(_owner,{frame,voiceCues})=>{faceCalls.push(["frame",frame,voiceCues.get("GORO")?.positionSeconds]);return true;}};
  };
  const motions=[];
  runtime.motionRuntime.applyNamed=(_model,selection,elapsed)=>{motions.push({name:selection.name,elapsed});return true};
  assert.equal(await runtime.play({kind:"scene-staging-start",scene},transaction),true);
  assert.deepEqual(faceCalls.slice(0,2),[["prepare","AKIR","GORO"],["begin","AKIR","GORO"]]);
  const audio={currentTime:.25};
  assert.equal(runtime.speakWithStagedFace("AKIR",goroModel,{},audio),null);
  assert.equal(runtime.speakWithStagedFace("GORO",{}, {},audio),null);
  const releaseVoice=runtime.speakWithStagedFace("GORO",goroModel,{},audio);
  runtime.update(transaction,0);
  assert.deepEqual(faceCalls.at(-1),["frame",0,.25]);
  audio.currentTime=.35;
  runtime.update(transaction,0);
  assert.deepEqual(faceCalls.at(-1),["frame",0,.35]);
  releaseVoice();
  runtime.update(transaction,0);
  assert.deepEqual(faceCalls.at(-1),["frame",0,undefined]);
  const advanceTo=seconds=>runtime.update(transaction,seconds-runtime.active.elapsed);
  for(const {atSeconds} of scene.dialogueCues){
    if(atSeconds>6.5&&runtime.active.elapsed<5.9){
      advanceTo(5.9);
      assert.equal(motions.at(-1).name,"AKI_AKI_RUN_LP");
      assert.ok(Math.abs(motions.at(-1).elapsed-(5.9-170/30)*0.75)<1e-10);
    }
    advanceTo(atSeconds);
    assert.equal(await runtime.play({kind:"scene-staging-dialogue-cue",scene,atSeconds},transaction),true);
  }
  advanceTo(scene.durationSeconds);
  assert.equal(await runtime.play({kind:"scene-staging-finish",scene},transaction),true);
  assert.deepEqual(faceCalls.at(-1),["clear"]);
});

test("cancelling a stage while its face loads prevents late head acquisition",async()=>{
  const {runtime,transaction,scene}=harness();
  scene.facialAssets={AKIR:{bodyModelCode:"AKI_L"}};
  let enter,finish;
  const preparing=new Promise(resolve=>{enter=resolve;});
  const loaded=new Promise(resolve=>{finish=resolve;});
  const calls=[];
  runtime.createFaces=()=>({prepare:()=>{enter();return loaded;},
    begin:()=>calls.push("begin"),clear:()=>{calls.push("clear");}});
  const started=runtime.play({kind:"scene-staging-start",scene},transaction);
  await preparing;
  runtime.cancel(transaction);
  finish();
  await assert.rejects(started,/released/);
  assert.deepEqual(calls,["clear"]);
  assert.equal(runtime.active,null);
});

test("an original first-frame voice cue is available as soon as its scene starts", async () => {
  const {runtime,transaction,scene}=harness();
  Object.assign(scene,{durationSeconds:2,waitForMotionCompletion:false,
    dialogueCues:[{voiceId:"E1081B001",atSeconds:0}]});
  await runtime.play({kind:"scene-staging-start",scene},transaction);
  assert.equal(await runtime.play({kind:"scene-staging-dialogue-cue",scene,atSeconds:0},transaction),true);
  assert.equal(await runtime.play({kind:"scene-staging-dialogue-cue",scene},transaction),false);
  runtime.cancel(transaction);
});

test("timed scroll dialogue joins the same staged performance and releases a pending cue on cancel", async () => {
  const {runtime,transaction,scene}=harness();
  Object.assign(scene,{durationSeconds:8,waitForMotionCompletion:false,playThroughFinish:true,
    dialogueCues:[{voiceId:"SA1109A001",atSeconds:1},{voiceId:"SA1109B001",atSeconds:3}]});
  await runtime.play({kind:"scene-staging-start",scene},transaction);
  const waitAt=atSeconds=>runtime.play({kind:"scene-staging-dialogue-cue",scene,atSeconds},transaction);
  const first=waitAt(1);
  runtime.update(transaction,.9);
  assert.ok(runtime.active.resolve);
  runtime.update(transaction,.1);
  assert.equal(await first,true);
  const second=waitAt(3);
  runtime.update(transaction,1.9);
  assert.ok(runtime.active.resolve);
  runtime.cancel(transaction);
  await assert.rejects(second,/released/);
  assert.equal(runtime.active,null);
});

test("the warehouse director follows the incoming camera, seven stages and the native staff clock", async () => {
  const {runtime,transaction,calls}=harness();
  const id="s1.ms8s.warehouse-eight-office";
  transaction.area="MS8S";
  const stages=new Map(scenes.scenes.filter(s=>s.continuationGroup===id).map(s=>[s.id,s]));
  const models=Object.fromEntries(["AKIR","TMHN","TKSA"].map(tag=>[tag,{tag}]));
  const placements={},samples={};
  runtime.actors.activeActor=tag=>({model:models[tag]});
  runtime.actors.applyTransform=(_owner,tag,pose)=>{placements[tag]=pose;return true;};
  runtime.motionRuntime.applyNamed=(actor,motion,time)=>{samples[actor.tag]={motion:motion.name,time};return true;};
  const initial={positionX:20,positionY:6,positionZ:140,targetX:18,targetY:5.5,targetZ:137,roll:0,perspective:70};
  let view;
  runtime.camera.currentPose=()=>initial;
  runtime.camera.apply=(_owner,pose)=>{view=pose;return true;};
  runtime.capturePlayerState=()=>({position:[-19.5,4.275,137.75]});
  const start=async suffix=>{
    const scene=stages.get(suffix?id+"."+suffix:id);
    assert.equal(await runtime.play({kind:suffix?"scene-staging-transition":"scene-staging-start",scene},transaction),true);
  };
  const tick=seconds=>runtime.update(transaction,seconds);
  await start("");
  assert.deepEqual(view,initial);
  assert.equal(placements.AKIR.x,19.5);
  tick(2);
  assert.ok(Math.abs(placements.AKIR.x-16.15)<0.00001);
  assert.ok(view.positionX>15&&view.positionX<16);
  await start("lean");
  const gaze = calls.at(-1);
  assert.deepEqual(gaze, {name:"face-gaze",actorTag:"AKIR",mode:2,durationNativeTicks:60,
    target:{kind:"world-point",position:[16.6299991607666,5.599999904632568,131.8699951171875]},callFileOffset:"0x27762"});
  assert.equal(samples.AKIR.time,40/30);
  tick(4);
  assert.ok(Math.abs(samples.AKIR.time-160/30)<1e-8);
  await start("staff");
  assert.equal(samples.AKIR.time,160/30);
  tick(350/30);
  assert.ok(Math.abs(view.positionX-14.43)<0.02);
  assert.equal(samples.TKSA.time,175/30);
  const staffAtHold=samples.TKSA.time, tomohito=samples.TMHN.time;
  await start("staff-hold");
  const before={...view};
  tick(2);
  assert.notDeepEqual(view,before);
  assert.equal(samples.TKSA.time,staffAtHold);
  assert.equal(samples.TMHN.time,tomohito+2);
  await start("listen-out");
  tick(1);
  const lastStaff={...view};
  await start("reaction");
  assert.equal(view.positionX,lastStaff.positionX);
  assert.equal(view.targetZ,lastStaff.targetZ);
  tick(5);
  assert.ok(Math.abs(view.positionX-14.72)<0.02);
  let alpha,travelCover=false;
  runtime.screenFade=new NativeStoryScreenFade({present:(_owner,value)=>{alpha=value;},
    clear:()=>{alpha=0;},handoff:()=>{assert.equal(alpha,255);travelCover=true;}});
  const departure=start("departure");
  assert.equal(alpha,0);
  tick(29/30);
  assert.equal(runtime.active.scene.id,id+".reaction");
  assert.equal(alpha,246);
  tick(1/30);assert.equal(alpha,255);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(runtime.active.scene.id,id+".departure");
  assert.equal(alpha,255);
  tick(29/30);assert.equal(alpha,8);
  tick(1/30);
  await departure;assert.equal(alpha,0);
  assert.deepEqual([placements.AKIR.x,placements.AKIR.z,placements.AKIR.rotationY],[17.25,152.25,225]);
  assert.ok(view.positionZ>150&&view.positionY>5);
  const finish=runtime.play({kind:"scene-staging-finish",scene:stages.get(id+".departure")},transaction);
  tick(59/30);
  assert.equal(alpha,250);assert.equal(travelCover,false);
  tick(1/30);
  assert.equal(await finish,true);assert.equal(travelCover,true);
  assert.equal(calls.filter(c=>c==="actors-begin").length,1);
  assert.equal(calls.filter(c=>c==="camera-end").length,1);
});

test("cancelling before or after covered reposition releases the foreground and the original actor lease",async()=>{
  for (const afterReposition of [false,true]) {
    const {runtime,scene,transaction,calls}=harness();
    scene.continuationGroup="fade-test";
    let visibleAlpha=0, transfers=0;
    runtime.screenFade=new NativeStoryScreenFade({
      present:(_tx,alpha)=>{visibleAlpha=alpha;},clear:()=>{visibleAlpha=0;},handoff:()=>transfers++,
    });
    await runtime.play({kind:"scene-staging-start",scene},transaction);
    const departure={...scene,id:"departure",screenFades:{
      beforeReposition:{durationFrames:30,fromAlpha:0,toAlpha:255},
      afterReposition:{durationFrames:30,fromAlpha:255,toAlpha:0},
    }};
    const entering=runtime.play({kind:"scene-staging-transition",scene:departure},transaction);
    if(afterReposition) {
      runtime.update(transaction,1);
      await new Promise(resolve=>setImmediate(resolve));
    }
    runtime.update(transaction,0.5);
    assert.equal(visibleAlpha,127);
    assert.equal(runtime.active.scene.id,afterReposition?"departure":scene.id);
    const rejected=assert.rejects(entering,{name:"AbortError"});
    assert.equal(runtime.cancel(transaction),true);
    await rejected;
    assert.equal(visibleAlpha,0);
    assert.equal(runtime.active,null);
    assert.equal(transfers,0);
    assert.equal(calls.filter(value=>value==="camera-end").length,1);
  }
});

test("an unavailable departure motion under full black releases the failed scene",async()=>{
  const {runtime,scene,transaction,calls}=harness();
  scene.continuationGroup="fade-test";
  let alpha=0;
  runtime.screenFade=new NativeStoryScreenFade({present:(_tx,a)=>{alpha=a;},clear:()=>{alpha=0;},
    handoff:()=>assert.fail("a failed reposition must not transfer")});
  await runtime.play({kind:"scene-staging-start",scene},transaction);
  runtime.motionRuntime.loadNamedSelections=async()=>{throw Error("missing departure motion");};
  const entering=runtime.play({kind:"scene-staging-transition",scene:{...scene,id:"departure",screenFades:{
    beforeReposition:{durationFrames:30,fromAlpha:0,toAlpha:255},
    afterReposition:{durationFrames:30,fromAlpha:255,toAlpha:0},
  }}},transaction);
  const rejected=assert.rejects(entering,/missing departure motion/);
  runtime.update(transaction,1);assert.equal(alpha,255);
  await rejected;
  assert.equal(alpha,0);assert.equal(runtime.active,null);
  assert.equal(calls.filter(value=>value==="camera-end").length,1);
});

test("a timed warehouse occurrence covers the gameplay camera before moving Ryo or the staff",async()=>{
  const id="s1.ms8s.warehouse-eight-office.timed";
  const timed=scenes.scenes.find(scene=>scene.id===id);
  const {runtime,transaction,calls}=harness();
  transaction.area=timed.area;
  let alpha=0, view;
  runtime.screenFade=new NativeStoryScreenFade({
    present:(_owner,value)=>{alpha=value;},clear:()=>{alpha=0;},handoff:()=>assert.fail("unexpected travel"),
  });
  const placements={};
  runtime.actors.applyTransform=(_owner,tag,pose)=>{placements[tag]=pose;return true;};
  runtime.camera.apply=(_owner,pose)=>{view=pose;return true;};
  const start=runtime.play({kind:"scene-staging-start",scene:timed},transaction);
  runtime.update(transaction,29/30);
  assert.equal(alpha,246);
  assert.deepEqual(placements,{});
  assert.equal(calls.includes("camera-begin"),false);
  runtime.update(transaction,1/30);
  await start;
  assert.equal(alpha,255);
  assert.equal(placements.AKIR.rotationY,45);
  assert.ok(Math.abs(placements.AKIR.x-17.69)<1e-5);
  assert.deepEqual(view,timed.camera);
  const wait=runtime.play({kind:"scene-staging-dialogue-cue",scene:timed,atSeconds:12/30},transaction);
  runtime.update(transaction,11/30);
  assert.equal(typeof runtime.active.resolve,"function");
  runtime.update(transaction,1/30);
  assert.equal(await wait,true);
  const walking=scenes.scenes.find(scene=>scene.id===id+"-approach");
  const approach=runtime.play({kind:"scene-staging-transition",scene:walking},transaction);
  await new Promise(resolve=>setImmediate(resolve));
  const first=view;
  runtime.update(transaction,1/30);
  assert.equal(alpha,255,"native one-frame wait before the reveal");
  runtime.update(transaction,29/30);
  assert.equal(alpha,8);
  runtime.update(transaction,1/30);
  assert.equal(await approach,true);
  assert.equal(alpha,0);
  assert.ok(placements.AKIR.x<timed.actors[0].pose.x);
  assert.equal(first.positionX,timed.camera.positionX);
  runtime.update(transaction,29/30);
  assert.ok(Math.abs(placements.AKIR.x-16.15)<1e-4);
  runtime.cancel(transaction);
  assert.equal(alpha,0);
});

test("the downstairs hint keeps its final position and rendered heading only on authoritative completion",async()=>{
  const hint=scenes.scenes.find(scene=>scene.id==="s1.ms8s.warehouse-light-hint");
  assert.equal(hint.finishAtPlayerPose,true);
  assert.equal(hint.actors[0].tag,"AKIR");
  const heading=0.0534,position=[-14.5,0,144.5];
  for(const complete of [false,true]){
    const {runtime,scene,transaction,root,calls}=harness();
    scene.finishAtPlayerPose=true;
    root.rotationQuaternion={x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)};
    await runtime.play({kind:"scene-staging-start",scene},transaction);
    runtime.capturePlayerState=()=>({position,yaw:0,cameraYaw:10});
    assert.equal(await runtime.play({kind:"scene-staging-finish",scene},transaction),true);
    assert.equal(runtime.active.awaitingCommit,true);
    assert.equal(complete?runtime.commitPlayerPose(transaction):runtime.cancel(transaction),true);
    assert.equal(runtime.active,null);
    const restored=calls.at(-1);
    assert.deepEqual(restored.position,complete?position:[1,2,3]);
    assert.equal(restored.cameraYaw,4);
    if(complete) assert.ok(Math.abs(restored.yaw-heading)<1e-10);
  }
});

test("the three MS8S inspections preserve the gameplay pose and speak after the source 30-tick lead",async()=>{
  for(const slug of ["empty-floor","office-door","inner-office"]){
    const {runtime,transaction,calls}=harness();
    transaction.area="MS8S";
    const scene=scenes.scenes.find(s=>s.id==="s1.ms8s.warehouse-eight-"+slug);
    const samples=[], camera=[];
    runtime.updateGameplayCamera=(dt,entering)=>camera.push([dt,entering]);
    runtime.camera.apply=()=>assert.fail("inspection must keep the map camera");
    runtime.actors.applyTransform=()=>assert.fail("inspection must retain the player transform");
    runtime.motionRuntime.applyNamed=(_model,clip,time)=>{
      assert.equal(clip.bank,"free");assert.equal(clip.name,"AKI_AKI_TATI_IWA_L");assert.equal(clip.loop,false);
      samples.push(time);return true;
    };
    let started=false;
    const start=runtime.play({kind:"scene-staging-start",scene},transaction).then(result=>{started=true;return result;});
    await new Promise(resolve=>setImmediate(resolve));
    runtime.update(transaction,29/30);
    await Promise.resolve();
    assert.equal(started,false);
    assert.equal(samples.length>0,slug!=="empty-floor");
    runtime.update(transaction,1/30);
    assert.equal(await start,true);
    assert.equal(samples.at(-1),slug==="empty-floor"?0:1);
    assert.ok(camera.some(([,entering])=>entering));
    assert.equal(await runtime.play({kind:"scene-staging-finish",scene},transaction),true);
    assert.deepEqual(calls.at(-1),{position:[1,2,3],cameraYaw:4});
  }
});

test("staged effects ring across a retained cut and release on normal finish or cancellation",async t=>{
  for(const exit of ["finish","cancel"]) await t.test(exit,async()=>{
    const h=harness(),played=[],stopped=[],reminders=[];
    const group="test-sounds";
    const effect=(id,atSeconds)=>({kind:"effect",asset:"public/audio/world/e1kaiqte/"+id+".wav",atSeconds});
    const reminder={asset:"public/audio/world/mai-alley/E1036A009.wav",atSeconds:.5};
    const first={...h.scene,id:"throw",continuationGroup:group,holdEndPose:true,retainOnFinish:true,
      durationSeconds:1,waitForMotionCompletion:false,soundCues:[effect("A9040100",0),reminder,effect("A9040200",.8)]};
    const next={...h.scene,id:"catch",continuationGroup:group,durationSeconds:2,waitForMotionCompletion:false,
      soundCues:[effect("A9040400",0),effect("A9040500",.4)]};
    h.runtime.worldSounds={playAsset:(asset,{signal})=>{
      played.push(asset);signal.addEventListener("abort",()=>stopped.push(asset),{once:true});return true;
    }};
    h.runtime.dialogueAudio={playOneShot:asset=>({asset}),stopOneShot:audio=>reminders.push(audio.asset)};
    const play=(scene,op)=>h.runtime.play({kind:"scene-staging-"+op,scene},h.transaction);
    assert.equal(await play(first,"start"),true);
    h.runtime.update(h.transaction,.6);
    h.runtime.update(h.transaction,.5); // Final source cue crossed on the last update.
    assert.equal(await play(first,"finish"),true);
    assert.equal(await play(next,"transition"),true);
    h.runtime.update(h.transaction,.4);h.runtime.update(h.transaction,0);
    assert.deepEqual(reminders,[reminder.asset]);
    assert.deepEqual(played,[first.soundCues[0].asset,first.soundCues[2].asset,...next.soundCues.map(c=>c.asset)]);
    assert.deepEqual(stopped,[]);
    if(exit==="cancel") assert.equal(h.runtime.cancel(h.transaction),true);
    else assert.equal(await play(next,"finish"),true);
    assert.deepEqual(stopped,played);
  });
});
