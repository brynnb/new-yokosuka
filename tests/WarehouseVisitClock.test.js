import assert from "node:assert/strict";
import test from "node:test";

import { StoryRegionRuntime } from "../play/scripts/StoryRegionRuntime.js";
import { WarehouseVisitClock, warehouseDirectorAvailable } from "../play/scripts/WarehouseVisitClock.js";
import { createNativeSceneGameplayState } from "../play/events/NativeSceneGameplayState.js";
import regionCatalog from "../play/data/story-regions.json" with {type: "json"};

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


const floorInspection = "MS8S.empty-floor";
const officeInspection = "MS8S.office-door";
const innerInspection = "MS8S.inner-office";
const sourceInspections = regionCatalog.regions.filter(region =>
  [floorInspection, officeInspection, innerInspection].includes(region.object)
);

function finishInspection(start) {
  const name = start.selector.object.split(".")[1];
  start.context.onStoryComplete({scriptSlug: `story-s1-warehouse-eight-${name}`});
}

test("the MS8S inspection rectangle shares the native float32 pose and inclusive sides, with a strict height ceiling", () => {
  assert.equal(sourceInspections.length, 3, "each recovered inspection needs a server-authorized use region");
  const step = pose => visit({regions: sourceInspections}).update({playerPosition: pose});
  assert.equal(step([-23.125, 0, 140]), true);
  assert.equal(step([-4.4257001876831055 + 1e-8, 4 - 2 ** -22, 146.3000030517578 + 1e-8]), true);
  assert.equal(step([-23.1251, 0, 142]), false);
  assert.equal(step([-20, 0, 139.999]), false);
  assert.equal(step([-20, 4 - 1e-8, 142]), false, "rounding to exactly 4 stays outside");
});

test("both upstairs comments use the native 3D radius, height and strict opposite-bearing exclusion", () => {
  for (const object of [officeInspection, innerInspection]) {
    const {center} = sourceInspections.find(region => region.object === object).nativeApproach;
    const [x, y, z] = [-center[0], center[1], center[2]];
    const {update, starts} = visit({regions: sourceInspections});
    assert.equal(update({playerPosition: [x, 4 + 1e-9, z]}), false);
    assert.equal(update({playerPosition: [x, y, z + 0.301]}), false);
    assert.equal(update({playerPosition: [x, y, z - 0.1]}), false, "exactly opposite the native approach");
    assert.equal(update({playerPosition: [x, 4 + 2 ** -21, z]}), true);
    assert.deepEqual(starts[0].selector, {kind: "use", object});
  }
});

test("inspection cancellation waits for a genuine exit; each success latches independently for this warehouse visit", () => {
  const {runtime, update, starts, publish, controls} = visit({entry: guardEntry, regions: sourceInspections});
  const at = object => {
    const center = sourceInspections.find(region => region.object === object).nativeApproach?.center;
    return {playerPosition: center ? [-center[0], center[1], center[2]] : [-20, 1, 142]};
  };
  const floor = at(floorInspection);
  publish(false);
  assert.equal(update(floor), false);
  publish(true);
  controls.schedulerSlot = 6; // Unlike the timed branches, these room modes do not test 0x1b8.
  assert.equal(update(floor), true);
  assert.equal(update(floor), false);
  controls.occupied = true;
  assert.equal(update(), false, "staging the actor outside cannot re-arm the inspection");
  controls.occupied = false;
  assert.equal(update(floor), false);
  assert.equal(update(), false);
  assert.equal(update(floor), true);
  finishInspection(starts.at(-1));
  for (const object of [officeInspection, innerInspection]) {
    assert.equal(update(at(object)), true);
    finishInspection(starts.at(-1));
  }
  for (const object of [floorInspection, officeInspection, innerInspection]) assert.equal(update(at(object)), false);
  assert.deepEqual([...runtime.warehouseClock.completedInspections], [floorInspection, officeInspection, innerInspection]);
  const previous = starts.at(-1);
  update({area: "MFSY", worldId: "mfsy"});
  assert.equal(update(floor), true);
  finishInspection(previous);
  assert.deepEqual([...runtime.warehouseClock.completedInspections], []);
});

test("a due timer goes first, A018 suppresses A006, and finishing A006 first still permits A018", () => {
  const floor = {playerPosition: [-16, 0, 145]};
  for (const floorFirst of [false, true]) {
    const {runtime, update, starts, controls} = visit({regions: sourceInspections});
    if (floorFirst) {
      assert.equal(update(floor), true);
      assert.equal(starts[0].selector.object, floorInspection);
      finishInspection(starts[0]);
      assert.equal(runtime.warehouseClock.lightingSeen, false);
    }
    controls.input = true;
    assert.equal(update({...floor, deltaSeconds: 14401 / 30}), true);
    assert.equal(starts.at(-1).selector.object, light);
    starts.at(-1).context.onStoryComplete({scriptSlug: "story-s1-warehouse-eight-light-timeout"});
    assert.equal(update(), false);
    assert.equal(update(floor), false);
    const {center} = sourceInspections.find(region => region.object === officeInspection).nativeApproach;
    assert.equal(update({playerPosition: [-center[0], center[1], center[2]]}), true, "A018 leaves upstairs comments eligible");
    assert.equal(starts.at(-1).selector.object, officeInspection);
  }
});

test("an overlapping physical entry and then the independent deadline precede a queued inspection", () => {
  const floor = {playerPosition: [-18, 0, 142]};
  const regions = [...sourceInspections, {id: "ordinary-entry", area: "MS8S", min: [-19, -1, 141], max: [-17, 1, 143]}];
  const {update, starts} = visit({regions});
  assert.equal(update({...floor, deltaSeconds: 28801 / 30}), true);
  assert.deepEqual(starts.at(-1).selector, {kind: "enter"});
  assert.equal(update(floor), true);
  assert.equal(starts.at(-1).selector.object, deadline);
  assert.equal(update(floor), true);
  assert.equal(starts.at(-1).selector.object, floorInspection);
});

test("0x01ae accepts fresh room state and honors available primary and global-controller registers", () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const ready = () => warehouseDirectorAvailable(scene, true);
  const set = (offset, value, width = 4) => scene.writeNativeField({offset, width, value});
  assert.equal(ready(), true, "the authored ambient director is a live event even while the native VM is idle");
  assert.equal(warehouseDirectorAvailable(scene, false), false);
  for (const [offset, width] of [[0x0c224848, 4], [0x0c224c9c, 1], [0x0c220810, 4]]) {
    set(offset, 1, width);
    assert.equal(ready(), false);
    set(offset, 0, width);
    assert.equal(ready(), true);
  }
  set(0x0c29b134, 2);
  assert.equal(ready(), false);
  set(0x0c29b134, 0xffffffff);
  set(0x0c29b130, 2);
  assert.equal(ready(), false, "selector 3 can also derive a nonnegative status from mode 2");
  set(0x0c29b130, 0);
  assert.equal(ready(), true);
  const initial = scene.readPrimaryRuntimeState();
  for (const change of [{available: false}, {stateDword1f8: 2}, {gateByte: 3}]) {
    scene.configurePrimaryRuntimeState({...initial, ...change});
    assert.equal(ready(), false);
  }
  scene.configurePrimaryRuntimeState({...initial, gateByte: 1});
  assert.equal(ready(), true);
});

test("the shared native availability check defers physical, timed and inspection dispatch without consuming the clock", () => {
  const floor = {playerPosition: [-18, 0, 142]};
  const regions = [...sourceInspections, {id: "ordinary-entry", area: "MS8S", min: [-19, -1, 141], max: [-17, 1, 143]}];
  const {controls, update, starts, runtime} = visit({regions});
  controls.directorAvailable = false;
  assert.equal(update({...floor, deltaSeconds: 28801 / 30}), false);
  assert.equal(runtime.warehouseClock.deadlineTicks, -1);
  assert.equal(starts.length, 0);
  controls.directorAvailable = true;
  assert.equal(update(floor), true);
  assert.deepEqual(starts.at(-1).selector, {kind: "enter"});
});
