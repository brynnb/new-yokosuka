import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeLocomotionSelection,
  playableLocomotionModelYawOffset,
  PlayableLocomotionRuntime,
  supportsPlayableEmotes,
} from "../play/characters/PlayableLocomotionRuntime.js";

test("playable animals select native locomotion by controller family", () => {
  assert.deepEqual(nativeLocomotionSelection(16, "idle", 2), {
    bank: "mobj",
    name: "CAT_CAT_TATI_LP",
    loop: true,
    elapsedSeconds: 2,
  });
  assert.deepEqual(nativeLocomotionSelection(18, "walk", 3), {
    bank: "mobj",
    name: "DOG_DOG_WALK_LP",
    loop: true,
    elapsedSeconds: 3,
  });
  assert.deepEqual(nativeLocomotionSelection(18, "run", 4), {
    bank: "mobj",
    name: "DOG_DOG_RUN_LP",
    loop: true,
    elapsedSeconds: 4,
  });
  assert.equal(nativeLocomotionSelection(10, "walk", 1), null);
  assert.equal(nativeLocomotionSelection(16, "forkliftSit", 1), null);
});

test("native animal controller families reject humanoid emotes", () => {
  assert.equal(supportsPlayableEmotes({ controllerFamily: 16 }), false);
  assert.equal(supportsPlayableEmotes({ controllerFamily: 18 }), false);
  assert.equal(supportsPlayableEmotes({ controllerFamily: 10 }), true);
  assert.equal(supportsPlayableEmotes({}), true);
});

test("dog locomotion exposes its native playable forward basis", () => {
  assert.equal(
    playableLocomotionModelYawOffset({ controllerFamily: 18 }),
    Math.PI,
  );
  assert.equal(
    playableLocomotionModelYawOffset({ controllerFamily: 16 }),
    0,
  );
  assert.equal(
    playableLocomotionModelYawOffset({ controllerFamily: 10 }),
    0,
  );
});

test("cat run keeps its native gait and scales cadence to movement speed", () => {
  assert.deepEqual(nativeLocomotionSelection(16, "run", 2, {
    runCadenceScale: 1.75,
  }), {
    bank: "mobj",
    name: "CAT_CAT_WALK_LP",
    loop: true,
    elapsedSeconds: 3.5,
  });
});

test("runtime applies the same family profile to local and remote models", () => {
  const calls = [];
  const runtime = new PlayableLocomotionRuntime({
    motionRuntime: {
      applyNamed(model, selection, elapsedSeconds) {
        calls.push({ model, selection, elapsedSeconds });
        return true;
      },
    },
  });
  runtime.setRunCadenceScale(2);
  const model = runtime.createModel(
    { controllerFamily: 16, modelCode: "CT3_M" },
    {},
    {},
  );

  assert.equal(runtime.apply(model, "run", 1.5), true);
  assert.equal(calls[0].selection.name, "CAT_CAT_WALK_LP");
  assert.equal(calls[0].selection.elapsedSeconds, 3);
  assert.equal(runtime.createModel(
    { controllerFamily: 10, modelCode: "PAN_L" },
    {},
    {},
  ), null);
});

test("runtime preloads locomotion clips with root travel extraction", async () => {
  let selections = null;
  const runtime = new PlayableLocomotionRuntime({
    motionRuntime: {
      async loadNamedSelections(value) {
        selections = value;
      },
    },
  });

  await runtime.configure();

  assert.ok(selections.some((selection) => (
    selection.name === "DOG_DOG_RUN_LP" && selection.movement
  )));
  assert.ok(selections.some((selection) => (
    selection.name === "CAT_CAT_TATI_LP" && !selection.movement
  )));
});
