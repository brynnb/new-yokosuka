import assert from "node:assert/strict";
import test from "node:test";

import { StoryRegionRuntime } from "../play/scripts/StoryRegionRuntime.js";
import { WarehouseVisitClock } from "../play/scripts/WarehouseVisitClock.js";

const frame = {area: "MS8S", worldId: "ms8s", playerPosition: [0, 4, 0], enabled: true, deltaSeconds: 0};
const light = "MS8S.light-timeout";
const office = "MS8S.office-timeout";
const deadline = "MS8S.office-deadline";
const windowEntry = "story.s1.warehouse-eight-window.completed";
const guardEntry = "story.s1.goro-guard-distraction.completed";

function visit({entry = windowEntry, regions = []} = {}) {
  const character = {id: 7, modeRevision: 1, playMode: "story", openingCompleted: true, storyFlags: {[entry]: true}};
  const controls = {input: false, paused: false, schedulerSlot: -1};
  const native = new Set();
  const starts = [];
  const controller = {status: "idle", async start(selector, context) { starts.push({selector, context}); }};
  let published = true;
  const runtime = new StoryRegionRuntime({
    controller, regions, getCharacter: () => character, hasNativeFlag: flag => native.has(flag),
    warehouseControls: () => controls, publishPresence: () => published,
  });
  const update = overrides => runtime.update({...frame, ...overrides});
  update();
  return {runtime, update, controls, character, starts, native, controller, publish: value => {published = value;}};
}

test("MS8S samples active controls at 30 Hz and the signed expiration is strictly below zero", () => {
  const clock = new WarehouseVisitClock();
  clock.update(3, false, false);
  assert.equal(clock.remainingTicks, 14400);
  assert.equal(clock.deadlineTicks, 28710);
  clock.update(1 / 60, false, false);
  clock.update(1 / 60, true, false);
  assert.equal(clock.remainingTicks, 14399);
  clock.update(14399 / 30, true, false);
  assert.equal(clock.remainingTicks, 0);
  assert.equal(clock.selector(4), null);
  clock.update(1 / 30, false, true);
  assert.equal(clock.remainingTicks, -1);
  assert.equal(clock.selector(4 + 1e-9), light);
  assert.equal(clock.selector(4 + 2 ** -21), office);
});

test("the independent room coroutine expires on its 28,801st tick even if the controls remain untouched", () => {
  const clock = new WarehouseVisitClock();
  clock.update(28800 / 30, false, false);
  assert.equal(clock.selector(0), null);
  clock.update(1 / 30, false, false);
  assert.equal(clock.remainingTicks, 14400);
  assert.equal(clock.selector(0), deadline);
  assert.equal(clock.selector(5), deadline);
});

test("either earned entrance admits the timers and a native interaction must release slot zero before dispatch", () => {
  for (const entry of [guardEntry, windowEntry]) {
    const {runtime, controls, update, starts, publish} = visit({entry});
    controls.input = true;
    controls.paused = true;
    assert.equal(update({deltaSeconds: 480}), false);
    assert.deepEqual([runtime.warehouseClock.remainingTicks, runtime.warehouseClock.deadlineTicks], [14400, 28800]);
    controls.paused = false;
    controls.schedulerSlot = 2;
    assert.equal(update({deltaSeconds: 14401 / 30}), false);
    assert.equal(runtime.warehouseClock.remainingTicks, -1);
    controls.schedulerSlot = 0xffffffff;
    publish(false);
    assert.equal(update(), false);
    publish(true);
    assert.equal(update(), true);
    assert.deepEqual(starts[0].selector, {kind: "use", object: light});
    assert.equal(update(), false);
    starts[0].context.onStoryComplete({scriptSlug: "story-s1-warehouse-eight-light-timeout"});
    assert.equal(update({playerPosition: [0, 5, 0]}), false, "the completed light hint inhibits both primary branches");
    assert.equal(update({deltaSeconds: 14400 / 30}), true);
    assert.equal(starts.at(-1).selector.object, deadline);
  }
});

test("a cancelled or declined offer with both clocks expired waits for fresh controls; stale completions cannot alter a new visit", () => {
  const {runtime, controls, update, starts} = visit();
  controls.input = true;
  assert.equal(update({deltaSeconds: 961}), true);
  assert.equal(starts[0].selector.object, light);
  assert.equal(update(), false);
  assert.equal(update({playerPosition: [0, 5, 0]}), false);
  controls.input = false;
  assert.equal(update(), false);
  controls.input = true;
  assert.equal(update({playerPosition: [0, 5, 0]}), true);
  assert.equal(starts[1].selector.object, office);
  assert.equal(update({area: "MA00", worldId: "harbor"}), false);
  assert.equal(runtime.warehouseClock, null);
  assert.equal(update(), false);
  starts[0].context.onStoryComplete({scriptSlug: "story-s1-warehouse-eight-light-timeout"});
  assert.equal(runtime.warehouseClock.lightingSeen, false);
  assert.deepEqual([runtime.warehouseClock.remainingTicks, runtime.warehouseClock.deadlineTicks], [14400, 28800]);
});

test("new physical approaches win the same frame and completed or unearned visits cannot start timed routes", () => {
  const regions = [{id: "window", area: "MS8S", min: [9, 4, -1], max: [11, 6, 1]}];
  const {update, starts, controls, controller} = visit({regions});
  controls.input = true;
  assert.equal(update({playerPosition: [10, 5, 0], deltaSeconds: 961}), true);
  assert.deepEqual(starts[0].selector, {kind: "enter"});
  controller.status = "line";
  assert.equal(update({playerPosition: [10, 5, 0]}), false);
  controller.status = "idle"; // A cancelled physical scene rolls back, leaving its separate timed branch due.
  assert.equal(update({playerPosition: [10, 5, 0]}), true);
  assert.equal(starts[1].selector.object, office);
  assert.equal(update({playerPosition: [10, 5, 0]}), false);
  for (const prior of ["unearned", "flag", "native"]) {
    const {update, starts, character, native} = visit();
    if (prior === "unearned") delete character.storyFlags[windowEntry];
    if (prior === "flag") character.storyFlags["story.s1.warehouse-eight-overheard.completed"] = true;
    if (prior === "native") native.add(242);
    assert.equal(update({deltaSeconds: 961}), false);
    assert.equal(starts.length, 0);
  }
});

test("an occupied director holds timed offers while the independent room coroutine still ticks", () => {
  const {update, starts, runtime, controls, controller} = visit();
  controls.input = true;
  update({deltaSeconds: 14401 / 30});
  assert.equal(starts[0].selector.object, light);
  controls.occupied = true;
  controller.status = "line";
  assert.equal(update({roomRunning: true, enabled: false, deltaSeconds: 480}), false);
  assert.equal(runtime.warehouseClock.deadlineTicks, -1);
  controls.occupied = false;
  controller.status = "idle";
  assert.equal(update(), false, "a held movement key cannot replay a cancelled timed scene");
  controls.input = false;
  update();
  controls.input = true;
  assert.equal(update(), true);
  starts.at(-1).context.onStoryComplete({scriptSlug: "story-s1-warehouse-eight-light-timeout"});
  assert.equal(update(), true);
  assert.equal(starts.at(-1).selector.object, deadline);
});
