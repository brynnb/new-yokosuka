import assert from "node:assert/strict";
import test from "node:test";

import {
  NativeAseqStandaloneActivityRuntime,
} from "../play/events/NativeAseqStandaloneActivityRuntime.js";

function harness() {
  const calls = [];
  const activityRuntime = {
    async startActivity(activity) {
      calls.push(["start", activity]);
      return { activityId: "AUTH/SEQ", durationFrames: 2 };
    },
    updateActivity(update) {
      calls.push(["update", update]);
      return true;
    },
    stopActivity(detail) {
      calls.push(["stop", detail]);
      return true;
    },
  };
  return { calls, activityRuntime };
}

test("standalone completion holds presentation until covered and can be disposed while waiting", async () => {
  for (const dispose of [false, true]) {
    const { calls, activityRuntime } = harness();
    let black;
    const completed = [];
    const runtime = new NativeAseqStandaloneActivityRuntime({
      activityRuntime,
      beforeComplete: () => new Promise(resolve => { black = resolve; }),
      onComplete: id => completed.push(id),
    });
    await runtime.start({ id: "scene", activity: { slot: 0 } });
    runtime.update(0.1);
    assert.ok(runtime.active);
    assert.equal(calls.some(([kind]) => kind === "stop"), false);
    runtime.update(1);
    if (dispose) runtime.stop("disposed");
    black();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
    assert.deepEqual(completed, dispose ? [] : ["scene"]);
  }
});

test("standalone AUTH activity advances at the native frame rate and completes", async () => {
  const { calls, activityRuntime } = harness();
  const completed = [];
  const runtime = new NativeAseqStandaloneActivityRuntime({
    activityRuntime,
    onComplete: id => completed.push(id),
  });
  await runtime.start({
    id: "scene-1",
    activity: { slot: 4, binding: { primaryPointer: 1, secondaryPointer: 2 } },
  });

  assert.equal(runtime.update(1 / 10), false);
  assert.deepEqual(
    calls.filter(([kind]) => kind === "update").map(([, update]) => [
      update.slot,
      update.previousFrame,
      update.currentFrame,
    ]),
    [[4, 0, 1], [4, 1, 2]],
  );
  assert.equal(calls.at(-1)[0], "stop");
  assert.deepEqual(completed, ["scene-1"]);
  assert.equal(runtime.active, null);
});

test("standalone AUTH activity delegates explicit cleanup", async () => {
  const { calls, activityRuntime } = harness();
  const stopped = [];
  const runtime = new NativeAseqStandaloneActivityRuntime({
    activityRuntime,
    onStopped: (reason, id) => stopped.push([reason, id]),
  });
  await runtime.start({ id: "scene-2", activity: { slot: 1, binding: {} } });

  assert.equal(runtime.stop("user-cancelled"), true);
  assert.equal(calls.at(-1)[1].reason, "user-cancelled");
  assert.deepEqual(stopped, [["user-cancelled", "scene-2"]]);
});

test("standalone forward seek crosses every frame without the render-delta clamp", async () => {
  const { calls, activityRuntime } = harness();
  activityRuntime.startActivity = async () => ({ activityId: "AUTH/SEQ", durationFrames: 500 });
  const runtime = new NativeAseqStandaloneActivityRuntime({ activityRuntime });
  assert.equal(runtime.seekBySeconds(5), false);
  await runtime.start({ id: "seek", activity: { slot: 0 } });
  assert.equal(runtime.transportState().active, true);
  runtime.update(1 / 30);
  assert.equal(runtime.seekBySeconds(5), true);
  assert.equal(runtime.active.frame, 151);
  assert.deepEqual(calls.filter(([kind]) => kind === "update").map(([, detail]) => detail.currentFrame),
    Array.from({ length: 151 }, (_, index) => index + 1));
  for (const seconds of [-5, 0, NaN, Infinity]) assert.equal(runtime.seekBySeconds(seconds), false);
  assert.equal(runtime.active.frame, 151);
  assert.equal(runtime.seekBySeconds(999), true);
  assert.equal(runtime.active, null);
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
  assert.equal(runtime.transportState().seeking, false);
});

test("seeking through the ending waits for coverage and cancellation cannot finish later", async () => {
  const { calls, activityRuntime } = harness();
  let cover;
  const completed = [];
  const runtime = new NativeAseqStandaloneActivityRuntime({ activityRuntime,
    beforeComplete: () => new Promise(resolve => { cover = resolve; }), onComplete: id => completed.push(id) });
  await runtime.start({ id: "covered", activity: { slot: 0 } });
  assert.equal(runtime.seekBySeconds(5), true);
  assert.equal(runtime.active.completing, true);
  assert.equal(runtime.seekBySeconds(5), false);
  runtime.stop("cancelled");
  cover();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(completed, []);
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
});

test("standalone stop cancels in-flight start and cleans a late adapter result", async () => {
  const { calls, activityRuntime } = harness();
  let resolve;
  let signal;
  activityRuntime.startActivity = (_activity, options) => {
    signal = options.signal;
    return new Promise(accept => { resolve = accept; });
  };
  const runtime = new NativeAseqStandaloneActivityRuntime({ activityRuntime });
  const starting = runtime.start({ id: "scene-3", activity: { slot: 1, binding: {} } });
  runtime.stop("user-cancelled");
  assert.equal(signal.aborted, true);
  resolve({ activityId: "AUTH/SEQ", slot: 1, durationFrames: 2 });
  await assert.rejects(starting, { name: "AbortError" });
  assert.equal(runtime.active, null);
  assert.equal(runtime.pendingStart, null);
  assert.equal(calls.at(-1)[1].reason, "start-cancelled");
});
