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
