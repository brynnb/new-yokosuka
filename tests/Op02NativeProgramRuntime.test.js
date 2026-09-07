import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createNativeActorByteState } from "../play/events/NativeActorByteState.js";
import { createNativeRoomScriptRuntime } from "../play/events/NativeRoomScriptRuntime.js";
import { createNativeSceneResourceRegistry } from "../play/events/NativeSceneResourceRegistry.js";
import { createNativeScriptedEventRuntime } from "../play/events/NativeScriptedEventRuntime.js";

const programPack = JSON.parse(readFileSync(
  "play/data/events/nativeEventPrograms.generated.json",
));
const manifest = JSON.parse(readFileSync(
  "play/assets/introduction/op02/manifest.json",
));
const program = programPack.programs.find(value => value.id === "S1-OP02-00");

function actorTag(value) {
  const word = value >>> 0;
  return String.fromCharCode(
    word & 0xff,
    word >>> 8 & 0xff,
    word >>> 16 & 0xff,
    word >>> 24 & 0xff,
  );
}

test("OP02 compiled owner program drives every embedded AUTH activity", async () => {
  const activityBySlot = new Map(manifest.activities.map(value => [
    value.slot,
    value,
  ]));
  const startedSlots = [];
  const tmnmResources = [];
  const presentationTimeline = [];
  const resourceRegistry = createNativeSceneResourceRegistry();
  const operation0050 = {
    beginProgram(detail) {
      for (const activity of manifest.activities) {
        detail.sceneState.installNativeEmbeddedAuthBinding({
          slot: activity.slot,
          activityId: activity.activityId,
        });
      }
      for (const tag of ["AKIR", "HAWK", "SINF"]) {
        detail.sceneState.configureObjectMapcRecord({
          objectTag: tag,
          objectAvailable: true,
          recordAvailable: true,
          controlWord: 0,
        });
        detail.sceneState.configureActorOsagState({
          actorTag: tag,
          available: true,
          osagNodeBytes: null,
          controllerFlagByte: 0x08,
        });
        detail.sceneState.configureActorControllerWordState({
          actorTag: tag,
          actorAvailable: true,
          controllerAvailable: true,
        });
        detail.sceneState.configureActorMomtByte6fState({
          objectTag: tag,
          actorAvailable: true,
          momtAvailable: true,
          value: 0,
        });
        detail.sceneState.configureActorMomtFlagState({
          objectTag: tag,
          actorAvailable: true,
          momtAvailable: true,
          flagsWord: 0,
        });
        detail.sceneState.configureActorFaceController({
          actorTag: tag,
          actorAvailable: true,
          momtAvailable: true,
          faceAvailable: false,
        });
        detail.sceneState.configureActorFaceClipControl({
          actorTag: tag,
          actorAvailable: true,
          momtAvailable: true,
          faceAvailable: false,
          clipAvailable: false,
        });
      }
      detail.sceneState.configureObjectTmnmRecord({
        objectTag: "HAWK",
        word0c: 0,
        word10: 0,
        word14: 0,
        word18: 0,
        word1c: 0,
      });
      detail.sceneState.configureNativeSecondaryMotionActor({
        actorTag: "SINF",
        actorAvailable: true,
        recordAvailable: true,
        modeByte06: 1,
        flagsByte00: 0,
        initialized: true,
      });
      return Object.freeze({ kind: "op02-test-owner" });
    },
    updateProgram: () => true,
    completeProgram: () => true,
    rollbackProgram: () => true,
    async startActivity({ slot, binding }) {
      const activity = activityBySlot.get(slot);
      assert.equal(binding.activityId, activity.activityId);
      startedSlots.push(slot);
      presentationTimeline.push(["activity", slot]);
      return {
        activityId: activity.activityId,
        slot,
        durationFrames: 1,
      };
    },
    updateActivity: () => true,
    stopActivity: async () => true,
    rollbackActivity: () => true,
  };
  const room = createNativeRoomScriptRuntime({
    operation013c: resourceRegistry.adapter(),
    operation0050,
    presentationOwner: {
      resolveCurrentPresentationOwner: actorTag,
    },
    scriptedScene: {
      dispatchSoundCommand: () => 0,
      readActorControllerStatus: () => 0,
      writeActorControllerFlagBit3: () => true,
    },
    transaction: {
      begin: () => ({}),
      update: () => true,
      commit: () => true,
      rollback: () => true,
    },
  });
  room.activateArea("OP02");

  let settlement = null;
  const runtime = createNativeScriptedEventRuntime({
    programPack,
    actorByteState: createNativeActorByteState(),
    createExecution: detail => room.beginTransaction(detail),
    onComplete: result => { settlement = result; },
    onStopped: result => { settlement = result; },
  });
  await runtime.startProgram({
    programId: program.id,
    entryFunction: program.entryFunction,
    area: program.area,
    context: {
      initialFrameFields: program.entryInvocation.initialFrameFields,
      applyNativeTmnmResource: detail => (
        tmnmResources.push(detail.resourceId),
        presentationTimeline.push(["tmnm", detail.resourceId]),
        true
      ),
    },
  });
  for (let frame = 0; frame < 10_000 && !settlement; frame += 1) {
    runtime.update(1 / 30);
    await new Promise(resolve => setImmediate(resolve));
  }

  assert.equal(settlement?.status, "completed", JSON.stringify(settlement));
  assert.deepEqual(startedSlots, [0, 1, 2, 3, 6, 4, 5]);
  assert.deepEqual(tmnmResources, [
    0xe002, 0xe002, 0xe002, 0xe004, 0xe002, 0xe002,
  ]);
  assert.deepEqual(presentationTimeline, [
    ["tmnm", 0xe002], ["activity", 0],
    ["tmnm", 0xe002], ["activity", 1],
    ["tmnm", 0xe002], ["activity", 2],
    ["activity", 3], ["tmnm", 0xe004],
    ["activity", 6], ["tmnm", 0xe002],
    ["activity", 4], ["tmnm", 0xe002],
    ["activity", 5],
  ]);
  assert.deepEqual(
    room.sceneState.readPresentationMutations(0).mutations.map(value => [
      value.kind,
      value.objectTag,
      value.enabled,
    ]),
    [
      ["object-runtime-flag", "HAWK", true],
      ["object-runtime-flag", "AKIR", false],
      ["object-presentation-flag", "AKIR", false],
      ["object-runtime-flag", "AKIR", false],
      ["object-runtime-flag", "SINF", true],
      ["object-runtime-flag", "SINF", false],
      ["object-runtime-flag", "SINF", true],
      ["object-runtime-flag", "SINF", true],
      ["object-runtime-flag", "HAWK", false],
    ],
  );
});
