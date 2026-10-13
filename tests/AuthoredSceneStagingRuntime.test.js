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
