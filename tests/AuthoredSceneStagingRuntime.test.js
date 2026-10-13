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
