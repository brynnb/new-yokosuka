import assert from "node:assert/strict";
import test from "node:test";
import { StoryRegionRuntime } from "../play/scripts/StoryRegionRuntime.js";

test("the hallway trigger waits for eligibility, publishes presence first, and dispatches once per entry", async () => {
  const calls = [], character = { id: 1, modeRevision: 0, playMode: "story", openingCompleted: false };
  const controller = { status: "idle", start: async (selector, context) => { calls.push([selector, context]); return { outcome: "started" }; } };
  const runtime = new StoryRegionRuntime({ controller, getCharacter: () => character, publishPresence: () => calls.push("presence") });
  const frame = { area: "JOMO", playerPosition: [-16.75, 0, 1], enabled: true };
  assert.equal(runtime.update(frame), false);
  character.openingCompleted = true;
  assert.equal(runtime.update({ ...frame, playerPosition: [-17.6, 0, 4.1] }), false);
  controller.status = "running";
  assert.equal(runtime.update(frame), false);
  controller.status = "idle";
  assert.equal(runtime.update({ ...frame, playerPosition: { x: -16.75, y: 0, z: 1 } }), true);
  assert.deepEqual(calls, ["presence", [{ kind: "enter" }, { area: "JOMO" }]]);
  assert.equal(runtime.update(frame), false);
  runtime.update({ ...frame, playerPosition: [0, 0, 0] });
  character.storyFlags = { "story.s1.first-allowance.completed": true };
  assert.equal(runtime.update(frame), false);
  character.playMode = "free_roam";
  assert.equal(runtime.update(frame), false);
});

test("a failed scene can retry after re-entry or reconnect without dispatching every frame", async () => {
  let attempts = 0, errors = 0;
  const runtime = new StoryRegionRuntime({ controller: { status: "idle", start: async () => { attempts++; throw Error("offline"); } },
    getCharacter: () => ({ id: 1, modeRevision: 0, playMode: "story", openingCompleted: true }),
    publishPresence() {}, onError: () => errors++ });
  const frame = { area: "JOMO", playerPosition: [-16.75, 0, 1], enabled: true };
  runtime.update(frame); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 1); assert.equal(errors, 1);
  runtime.reset(); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
});
