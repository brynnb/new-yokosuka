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
    captureGameplay: () => ({ world: "dobuita", avatarId: "fuku", position: [1, 2, 3], yaw: 0.75 }),
    restoreGameplay: async snapshot => calls.push(["restore-gameplay", snapshot]),
    startDirector: () => (calls.push("director"), true),
    stopDirector: reason => calls.push(["stop", reason]),
    endDirector: async reason => { calls.push(["end", reason]); runtime.complete(); },
    dialoguePersistence,
    physicsReady: Promise.resolve(),
    startPlayRuntime: () => calls.push("start-loop"),
    disposeMenuBackground: () => calls.push("dispose-menu"),
    setStarting: value => calls.push(["starting", value]),
    beginLoading: async () => calls.push("loading"),
    finishLoading: async () => calls.push("reveal"),
    showNotice: value => calls.push(["notice", value]),
  });
  return { calls, cutscene, runtime };
}

test("menu previews own isolated dialogue state through completion", async () => {
  const { calls, runtime } = createRuntime();
  const completion = runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtime.active);
  runtime.beginEnding("intro");
  assert.equal(runtime.complete(), true);
  await completion;
  assert.deepEqual(calls, [
    ["starting", true],
    "loading",
    "dispose-menu",
    "start-loop",
    "initialize",
    "character",
    "hydrate",
    "begin-sandbox",
    "director",
    "reveal",
    ["starting", false],
    ["starting", true],
    "end-sandbox",
    ["starting", false],
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

test("cutscene preparation retains the world cover, then reveals a running director", async () => {
  const { runtime, calls } = createRuntime();
  runtime.initializeWorld = options => {
    assert.equal(options.reveal, false);
    calls.push("initialize");
  };
  const completed = runtime.playFromMenu("intro");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.indexOf("director") < calls.indexOf("reveal"));
  let black;
  runtime.endDirector = async () => {
    await new Promise(resolve => { black = resolve; });
    calls.push("cleanup");
    runtime.complete();
  };
  let settled = false;
  completed.then(() => { settled = true; });
  runtime.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, "X must not start the next package before black");
  assert.equal(calls.includes("end-sandbox"), false);
  assert.equal(calls.includes("cleanup"), false);
  assert.equal(runtime.active.controller.signal.aborted, false);
  runtime.cancel(); // Repeated X must not begin another ending request.
  black();
  await completed;
  assert.equal(settled, true);
  assert.equal(calls.filter(call => call === "cleanup").length, 1);
});

for (const entry of ["initial-menu", "loaded-menu", "in-game"]) {
  test(`${entry} forwards the same loading presentation through world preparation`, async () => {
    const { runtime, cutscene } = createRuntime();
    const presentation = { label: "Yokosuka", dateTime: "1986-11-29T16:00:00Z" };
    cutscene.loadingPresentation = presentation;
    const seen = [];
    runtime.beginLoading = async (_world, _signal, value) => { seen.push(value); };
    runtime.initializeWorld = async options => { seen.push(options.loadingPresentation); };
    runtime.selectWorld = async (_world, options) => { seen.push(options.loadingPresentation); return true; };
    if (entry !== "initial-menu") runtime.getController = () => ({});
    const pending = entry === "in-game" ? runtime.requestInGame("intro") : runtime.playFromMenu("intro");
    await new Promise(resolve => setImmediate(resolve));
    runtime.complete();
    await pending;
    assert.equal(seen.length, 2);
    assert.ok(seen.every(value => value === presentation));
  });
}

const turn = () => new Promise(resolve => setImmediate(resolve));

for (const exit of ["complete", "skip", "runtime-error", "start-error", "timeout"]) {
  test(`sidebar ${exit} returns the pre-preview session exactly once, after sandbox release`, async () => {
    const { runtime, calls, cutscene } = createRuntime();
    runtime.getController = () => ({});
    const snapshot = runtime.captureGameplay();
    runtime.captureGameplay = () => { calls.push("capture-gameplay"); return snapshot; };
    let releaseReturn;
    runtime.restoreGameplay = async value => {
      assert.equal(value, snapshot);
      assert.equal(runtime.gameplayPreview.snapshot, snapshot);
      assert.equal(runtime.starting, true);
      calls.push("return");
      await new Promise(resolve => { releaseReturn = resolve; });
    };
    if (exit === "start-error") runtime.ensureCharacter = async () => { throw new Error("avatar unavailable"); };
    if (exit === "timeout") runtime.selectWorld = async () => { throw new Error("world load timed out"); };
    const pending = runtime.requestInGame("intro");
    await turn();
    assert.equal(await runtime.requestInGame("intro"), false, "repeat selection cannot replace the return snapshot");
    if (exit === "complete") runtime.complete();
    else if (exit === "skip") runtime.cancel();
    else if (exit === "runtime-error") runtime.fail(cutscene, "broken activity");
    await turn();
    assert.equal(typeof releaseReturn, "function");
    assert.equal(runtime.cancel(), true, "X during return is consumed without cancelling recovery");
    assert.equal(calls.filter(call => call === "capture-gameplay").length, 1);
    if (!["start-error", "timeout"].includes(exit)) {
      assert.ok(calls.indexOf("end-sandbox") < calls.indexOf("return"));
    }
    releaseReturn();
    assert.equal(await pending, ["complete", "skip"].includes(exit));
    assert.equal(runtime.gameplayPreview, null);
    assert.equal(runtime.starting, false);
    assert.equal(calls.filter(call => call === "return").length, 1);
    assert.ok(calls.lastIndexOf("reveal") > calls.indexOf("return"));
    // A completed/failed request does not poison a subsequent preview.
    runtime.ensureCharacter = async () => {};
    runtime.selectWorld = async () => true;
    runtime.restoreGameplay = async () => {};
    const retry = runtime.requestInGame("intro");
    await turn();
    runtime.complete();
    assert.equal(await retry, true);
  });
}

for (const stage of ["world", "avatar", "director"]) {
  test(`sidebar cancellation drains a late ${stage} load before restoring gameplay`, async () => {
    const { runtime, calls } = createRuntime();
    let release;
    const work = async () => {
      await new Promise(resolve => { release = resolve; });
      calls.push("late-work");
      return true;
    };
    runtime.getController = () => ({});
    if (stage === "world") runtime.selectWorld = work;
    if (stage === "avatar") runtime.ensureCharacter = work;
    if (stage === "director") runtime.startDirector = work;
    runtime.restoreGameplay = async () => calls.push("return");
    const pending = runtime.requestInGame("intro");
    await turn();
    runtime.cancel();
    await turn();
    assert.equal(calls.includes("return"), false);
    release();
    assert.equal(await pending, true);
    assert.ok(calls.indexOf("return") > calls.indexOf("late-work"));
    assert.equal(runtime.active, null);
    assert.equal(runtime.starting, false);
  });
}

test("disposal prevents a pending sidebar load from restoring or revealing gameplay", async () => {
  const { runtime, calls } = createRuntime();
  let release;
  runtime.ensureCharacter = () => new Promise(resolve => { release = resolve; });
  const pending = runtime.requestInGame("intro");
  await turn();
  runtime.cancel("disposed");
  release();
  assert.equal(await pending, false);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "restore-gameplay"), false);
  assert.equal(calls.includes("reveal"), false);
});

test("return-load failure stays covered and reports recovery failure instead of claiming success", async () => {
  const { runtime, calls } = createRuntime();
  runtime.restoreGameplay = async () => { throw new Error("return world offline"); };
  runtime.cancelWorld = () => calls.push("cancel-world");
  runtime.showRecoveryError = text => calls.push(["recovery-error", text]);
  const pending = runtime.requestInGame("intro");
  await turn();
  calls.length = 0;
  runtime.complete();
  assert.equal(await pending, false);
  assert.equal(calls.includes("reveal"), false);
  assert.equal(calls.includes("cancel-world"), true);
  assert.equal(calls.filter(call => call[0] === "recovery-error").length, 1);
});
