import assert from "node:assert/strict";
import test from "node:test";

import {
  CutscenePreviewRuntime,
  cutsceneStopReason,
} from "../play/cutscenes/CutscenePreviewRuntime.js";

function createRuntime() {
  const calls = [];
  const cutscene = { id: "intro", label: "Introduction", worldId: "op00" };
  const world = { id: "op00" };
  const dialoguePersistence = {
    state: null,
    gameplayState() { return this.state; },
    hydrate() { this.state = {}; calls.push("hydrate"); },
    beginSandbox: () => calls.push("begin-sandbox"),
    endSandbox: () => calls.push("end-sandbox"),
  };
  const runtime = new CutscenePreviewRuntime({
    getCutscene: id => id === cutscene.id ? cutscene : null,
    getWorld: id => id === world.id ? world : null,
    getActiveWorld: () => world,
    getController: () => null,
    selectWorld: () => (calls.push("select"), true),
    initializeWorld: () => calls.push("initialize"),
    ensureCharacter: () => calls.push("character"),
    startDirector: () => (calls.push("director"), true),
    stopDirector: reason => calls.push(["stop", reason]),
    dialoguePersistence,
    physicsReady: Promise.resolve(),
    startPlayRuntime: () => calls.push("start-loop"),
    disposeMenuBackground: () => calls.push("dispose-menu"),
    setStarting: value => calls.push(["starting", value]),
    showNotice: value => calls.push(["notice", value]),
  });
  return { calls, cutscene, runtime };
}

test("menu previews own isolated dialogue state through completion", async () => {
  const { calls, runtime } = createRuntime();
  const completion = runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtime.active);
  assert.equal(runtime.complete(), true);
  await completion;
  assert.deepEqual(calls, [
    ["starting", true],
    "dispose-menu",
    "start-loop",
    "initialize",
    "character",
    "hydrate",
    "begin-sandbox",
    "director",
    ["starting", false],
    "end-sandbox",
  ]);
});

test("preview failures retain nested native stop evidence", async () => {
  const { cutscene, runtime } = createRuntime();
  const completion = runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  runtime.fail(cutscene, {
    kind: "activity-stopped",
    reason: { status: "error", message: "missing motion" },
  });
  await assert.rejects(
    completion,
    /activity-stopped:error:missing motion/,
  );
  assert.equal(
    cutsceneStopReason({ kind: "outer", detail: "inner" }),
    "outer:inner",
  );
});

test("a director failure during startup rejects once and restores the sandbox", async () => {
  const { cutscene, runtime, calls } = createRuntime();
  runtime.startDirector = async () => {
    runtime.fail(cutscene, "program-load-failed");
    // Allow an event-loop turn before startup rejects, as a failed browser
    // fetch does. The completion promise must already have a rejection handler.
    await new Promise(resolve => setImmediate(resolve));
    throw new Error("program-load-failed");
  };
  await assert.rejects(runtime.playFromMenu("intro"), /program-load-failed/);
  assert.equal(runtime.active, null);
  assert.equal(calls.filter(call => call === "end-sandbox").length, 1);
  assert.deepEqual(calls.at(-1), ["starting", false]);
});

for (const stage of ["physics", "world", "character"]) {
  test(`cancelling during ${stage} preparation returns to the menu without starting late`, async () => {
    const { runtime, calls } = createRuntime();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    if (stage === "physics") runtime.physicsReady = gate;
    if (stage === "world") runtime.initializeWorld = () => gate;
    if (stage === "character") runtime.ensureCharacter = () => gate;
    runtime.cancelWorld = () => calls.push("cancel-world");
    const completed = runtime.playFromMenu("intro");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.starting, true);
    assert.equal(runtime.cancel(), true);
    await completed;
    assert.equal(runtime.active, null);
    assert.equal(runtime.starting, false);
    assert.equal(calls.includes("cancel-world"), stage === "world");
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.includes("director"), false);
    assert.equal(calls.includes("begin-sandbox"), false);
    assert.deepEqual(calls.at(-1), ["starting", false]);
  });
}

test("a cancelled director start returns to the selector without an error", async () => {
  const { runtime, calls } = createRuntime();
  runtime.startDirector = async (_cutscene, { signal }) => {
    runtime.complete();
    assert.equal(signal.aborted, false);
    return false;
  };
  await runtime.playFromMenu("intro");
  assert.equal(runtime.active, null);
  assert.equal(calls.filter(call => call === "end-sandbox").length, 1);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "stop"), false);
});

test("disposal cancels an initial preview before the scene is disposed", async () => {
  const { runtime, calls } = createRuntime();
  let release;
  runtime.initializeWorld = () => new Promise(resolve => { release = resolve; });
  const completed = runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  runtime.cancel("disposed");
  await completed;
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.includes("director"), false);
  assert.equal(runtime.active, null);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "stop"), [["stop", "disposed"]]);
});

test("world preparation errors do not end a sandbox that was never opened", async () => {
  const { runtime, calls } = createRuntime();
  runtime.initializeWorld = async () => { throw new Error("world request failed"); };
  await assert.rejects(runtime.playFromMenu("intro"), /world request failed/);
  assert.equal(runtime.active, null);
  assert.equal(calls.includes("end-sandbox"), false);
});

test("a cancelling world adapter's rejected promise remains observed", async () => {
  const { runtime } = createRuntime();
  runtime.initializeWorld = () => {
    runtime.cancel();
    return Promise.reject(new Error("cancelled world failed while unwinding"));
  };
  await runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.active, null);
});
